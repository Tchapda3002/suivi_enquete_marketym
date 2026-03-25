"""
Client PostgreSQL direct pour remplacer le client REST Supabase.
Meme interface que supabase-py : sb.table("x").select("y").eq("z", v).execute()
Mais execute du SQL direct au lieu d'appels HTTP (~3ms vs ~100ms par query).
"""
import json
import psycopg2
import psycopg2.extras
from psycopg2.pool import ThreadedConnectionPool
from contextlib import contextmanager
from typing import Any, Dict, List, Optional, Union


class QueryResult:
    """Imite le resultat du client Supabase."""
    def __init__(self, data: list, count: Optional[int] = None):
        self.data = data
        self.count = count


class QueryBuilder:
    """Construit et execute des requetes SQL avec la meme API que Supabase."""

    def __init__(self, pool: ThreadedConnectionPool, table_name: str):
        self._pool = pool
        self._table = table_name
        self._select_cols = "*"
        self._filters: List[tuple] = []  # (sql_fragment, params)
        self._order_col: Optional[str] = None
        self._order_asc: bool = True
        self._limit_val: Optional[int] = None
        self._count_mode: Optional[str] = None
        self._operation: str = "select"  # select, insert, update, delete, upsert
        self._payload: Any = None
        self._on_conflict: Optional[str] = None
        self._returning: bool = True

    # ── Filtres (chainables) ──

    def select(self, columns: str = "*", count: Optional[str] = None) -> "QueryBuilder":
        self._select_cols = columns
        self._count_mode = count
        return self

    def _col(self, column: str) -> str:
        """Qualifie une colonne. Gere la notation Supabase 'table.col' → "table"."col"."""
        if "." in column:
            table, col = column.split(".", 1)
            return f'"{table}"."{col}"'
        return f'"{column}"'

    def eq(self, column: str, value: Any) -> "QueryBuilder":
        self._filters.append((f'{self._col(column)} = %s', [value]))
        return self

    def neq(self, column: str, value: Any) -> "QueryBuilder":
        self._filters.append((f'{self._col(column)} != %s', [value]))
        return self

    def gt(self, column: str, value: Any) -> "QueryBuilder":
        self._filters.append((f'{self._col(column)} > %s', [value]))
        return self

    def gte(self, column: str, value: Any) -> "QueryBuilder":
        self._filters.append((f'{self._col(column)} >= %s', [value]))
        return self

    def lt(self, column: str, value: Any) -> "QueryBuilder":
        self._filters.append((f'{self._col(column)} < %s', [value]))
        return self

    def lte(self, column: str, value: Any) -> "QueryBuilder":
        self._filters.append((f'{self._col(column)} <= %s', [value]))
        return self

    def in_(self, column: str, values: list) -> "QueryBuilder":
        if not values:
            self._filters.append(("FALSE", []))
        else:
            placeholders = ",".join(["%s"] * len(values))
            self._filters.append((f'{self._col(column)} IN ({placeholders})', values))
        return self

    def is_(self, column: str, value: Any) -> "QueryBuilder":
        if value is None or value == "null":
            self._filters.append((f'{self._col(column)} IS NULL', []))
        else:
            self._filters.append((f'{self._col(column)} IS %s', [value]))
        return self

    def like(self, column: str, pattern: str) -> "QueryBuilder":
        self._filters.append((f'{self._col(column)} LIKE %s', [pattern]))
        return self

    def ilike(self, column: str, pattern: str) -> "QueryBuilder":
        self._filters.append((f'{self._col(column)} ILIKE %s', [pattern]))
        return self

    def order(self, column: str, desc: bool = False) -> "QueryBuilder":
        self._order_col = column
        self._order_asc = not desc
        return self

    def limit(self, count: int) -> "QueryBuilder":
        self._limit_val = count
        return self

    # ── Operations CRUD ──

    def insert(self, data: Union[dict, list]) -> "QueryBuilder":
        self._operation = "insert"
        self._payload = data if isinstance(data, list) else [data]
        return self

    def update(self, data: dict) -> "QueryBuilder":
        self._operation = "update"
        self._payload = data
        return self

    def delete(self) -> "QueryBuilder":
        self._operation = "delete"
        return self

    def upsert(self, data: Union[dict, list], on_conflict: str = "") -> "QueryBuilder":
        self._operation = "upsert"
        self._payload = data if isinstance(data, list) else [data]
        self._on_conflict = on_conflict
        return self

    # ── Execution ──

    def _build_where(self) -> tuple:
        if not self._filters:
            return "", []
        clauses = []
        params = []
        for sql, p in self._filters:
            clauses.append(sql)
            params.extend(p)
        return " WHERE " + " AND ".join(clauses), params

    # ── Relations Supabase → JOIN SQL ──
    # Mapping FK connu : table_source.colonne_fk → table_cible
    FK_MAP = {
        "affectations": {
            "enquete_id": "enquetes",
            "enqueteur_id": "enqueteurs",
        },
        "segmentations": {
            "enquete_id": "enquetes",
        },
        "quotas": {
            "segmentation_id": "segmentations",
            "answer_option_id": "answer_options",
            "enquete_id": "enquetes",
        },
        "answer_options": {
            "segmentation_id": "segmentations",
        },
        "response_counts": {
            "affectation_id": "affectations",
            "answer_option_id": "answer_options",
        },
        "completions_pays": {
            "pays_id": "pays",
        },
        "quota_group_segmentations": {
            "quota_group_id": "quota_groups",
            "segmentation_id": "segmentations",
        },
        "demandes_affectation": {
            "enquete_id": "enquetes",
            "enqueteur_id": "enqueteurs",
        },
        "pays": {
            "zone_id": "zones",
        },
    }

    def _parse_select_with_relations(self) -> tuple:
        """Parse les colonnes Supabase, retourne (sql_cols, joins, relation_configs).
        Gere : 'enqueteurs(token)', 'enquetes!inner(statut)', 'enquetes(*)', '*'
        """
        import re
        cols = []
        joins = []
        relation_configs = []  # [(relation_table, requested_cols, is_inner, alias)]
        seen_joins = set()

        # Split virgules en respectant les parentheses
        parts = []
        depth = 0
        current = ""
        for ch in self._select_cols:
            if ch == "(":
                depth += 1
                current += ch
            elif ch == ")":
                depth -= 1
                current += ch
            elif ch == "," and depth == 0:
                parts.append(current)
                current = ""
            else:
                current += ch
        if current:
            parts.append(current)

        for part in parts:
            part = part.strip()
            # Match relation : table(cols) ou table!inner(cols)
            m = re.match(r"(\w+?)(!inner)?\(([^)]+)\)", part)
            if m:
                rel_table = m.group(1)
                is_inner = m.group(2) is not None
                rel_cols = m.group(3).strip()
                alias = rel_table

                # Trouver la FK qui pointe vers cette table
                fk_col = None
                fks = self.FK_MAP.get(self._table, {})
                for fk, target in fks.items():
                    if target == rel_table:
                        fk_col = fk
                        break

                if fk_col and rel_table not in seen_joins:
                    join_type = "INNER JOIN" if is_inner else "LEFT JOIN"
                    joins.append(
                        f'{join_type} "{rel_table}" AS "{alias}" ON "{self._table}"."{fk_col}" = "{alias}"."id"'
                    )
                    seen_joins.add(rel_table)

                    if rel_cols == "*":
                        # On recupere tout en row_to_json
                        cols.append(f'row_to_json("{alias}".*) AS "{alias}"')
                    else:
                        # Colonnes specifiques → json_build_object
                        json_parts = []
                        for rc in rel_cols.split(","):
                            rc = rc.strip()
                            json_parts.append(f"'{rc}', \"{alias}\".\"{rc}\"")
                        cols.append(f'json_build_object({", ".join(json_parts)}) AS "{alias}"')
                    relation_configs.append((rel_table, rel_cols, is_inner, alias))
                continue

            if part == "*":
                cols.append(f'"{self._table}".*')
            else:
                cols.append(f'"{self._table}"."{part}"')

        return ", ".join(cols) if cols else f'"{self._table}".*', joins, relation_configs

    @contextmanager
    def _get_conn(self):
        conn = self._pool.getconn()
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            self._pool.putconn(conn)

    def execute(self) -> QueryResult:
        if self._operation == "select":
            return self._exec_select()
        elif self._operation == "insert":
            return self._exec_insert()
        elif self._operation == "update":
            return self._exec_update()
        elif self._operation == "delete":
            return self._exec_delete()
        elif self._operation == "upsert":
            return self._exec_upsert()
        raise ValueError(f"Operation inconnue: {self._operation}")

    def _exec_select(self) -> QueryResult:
        cols, joins, _ = self._parse_select_with_relations()
        sql = f'SELECT {cols} FROM "{self._table}"'
        for j in joins:
            sql += f" {j}"
        where, params = self._build_where()
        sql += where
        if self._order_col:
            direction = "ASC" if self._order_asc else "DESC"
            sql += f' ORDER BY "{self._table}"."{self._order_col}" {direction}'
        if self._limit_val:
            sql += f" LIMIT {self._limit_val}"

        with self._get_conn() as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute(sql, params)
                rows = cur.fetchall()
                data = [dict(r) for r in rows]
                count = len(data) if self._count_mode == "exact" else None
                return QueryResult(data, count)

    def _exec_insert(self) -> QueryResult:
        if not self._payload:
            return QueryResult([])
        keys = list(self._payload[0].keys())
        cols = ", ".join(f'"{k}"' for k in keys)
        row_placeholders = "(" + ", ".join(["%s"] * len(keys)) + ")"
        all_placeholders = ", ".join([row_placeholders] * len(self._payload))
        params = []
        for row in self._payload:
            for k in keys:
                val = row.get(k)
                # Convertir dict/list en JSON pour les colonnes JSONB
                if isinstance(val, (dict, list)):
                    val = json.dumps(val)
                params.append(val)

        sql = f'INSERT INTO "{self._table}" ({cols}) VALUES {all_placeholders} RETURNING *'

        with self._get_conn() as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute(sql, params)
                rows = cur.fetchall()
                return QueryResult([dict(r) for r in rows])

    def _exec_update(self) -> QueryResult:
        if not self._payload:
            return QueryResult([])
        set_parts = []
        params = []
        for k, v in self._payload.items():
            set_parts.append(f'"{k}" = %s')
            if isinstance(v, (dict, list)):
                v = json.dumps(v)
            params.append(v)

        sql = f'UPDATE "{self._table}" SET {", ".join(set_parts)}'
        where, where_params = self._build_where()
        sql += where + " RETURNING *"
        params.extend(where_params)

        with self._get_conn() as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute(sql, params)
                rows = cur.fetchall()
                return QueryResult([dict(r) for r in rows])

    def _exec_delete(self) -> QueryResult:
        sql = f'DELETE FROM "{self._table}"'
        where, params = self._build_where()
        sql += where + " RETURNING *"

        with self._get_conn() as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute(sql, params)
                rows = cur.fetchall()
                return QueryResult([dict(r) for r in rows])

    def _exec_upsert(self) -> QueryResult:
        if not self._payload:
            return QueryResult([])
        keys = list(self._payload[0].keys())
        cols = ", ".join(f'"{k}"' for k in keys)
        row_placeholders = "(" + ", ".join(["%s"] * len(keys)) + ")"
        all_placeholders = ", ".join([row_placeholders] * len(self._payload))
        params = []
        for row in self._payload:
            for k in keys:
                val = row.get(k)
                if isinstance(val, (dict, list)):
                    val = json.dumps(val)
                params.append(val)

        sql = f'INSERT INTO "{self._table}" ({cols}) VALUES {all_placeholders}'

        if self._on_conflict:
            conflict_cols = ", ".join(f'"{c.strip()}"' for c in self._on_conflict.split(","))
            update_parts = ", ".join(f'"{k}" = EXCLUDED."{k}"' for k in keys
                                     if k not in self._on_conflict.replace(" ", "").split(","))
            sql += f" ON CONFLICT ({conflict_cols})"
            if update_parts:
                sql += f" DO UPDATE SET {update_parts}"
            else:
                sql += " DO NOTHING"

        sql += " RETURNING *"

        with self._get_conn() as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute(sql, params)
                rows = cur.fetchall()
                return QueryResult([dict(r) for r in rows])


class DirectClient:
    """
    Remplacement drop-in du client Supabase.
    Utilise une connexion PostgreSQL directe au lieu de l'API REST.
    """

    def __init__(self, database_url: str, min_conn: int = 2, max_conn: int = 10):
        self._pool = ThreadedConnectionPool(min_conn, max_conn, database_url)
        # Test de connexion
        conn = self._pool.getconn()
        self._pool.putconn(conn)

    def table(self, name: str) -> QueryBuilder:
        return QueryBuilder(self._pool, name)

    def close(self):
        if self._pool:
            self._pool.closeall()
