import os
from dotenv import load_dotenv
load_dotenv('.env')
from supabase import create_client

sb = create_client(os.getenv('SUPABASE_URL'), os.getenv('SUPABASE_KEY'))

enquetes = sb.table('enquetes').select('id, nom, survey_id').execute()
for e in enquetes.data:
    if 'genz' in e['nom'].lower() or 'gen' in e['nom'].lower():
        print(f"Enquete: {e['nom']} | id={e['id']} | survey_id={e['survey_id']}")

        segs = sb.table('segmentations').select('*').eq('enquete_id', e['id']).execute()
        for s in segs.data:
            print(f"  Seg: {s['nom']} | qid={s['question_id']} | text={s.get('question_text','')}")

        affs = sb.table('affectations').select('id, survey_id, enqueteur_id, completions_total').eq('enquete_id', e['id']).execute()
        for a in affs.data:
            is_ancien = str(a['survey_id']) != str(e['survey_id'])
            sys_type = 'ANCIEN' if is_ancien else 'nouveau'
            print(f"  Aff: {a['id'][:8]} | survey={a['survey_id']} | completions={a['completions_total']} | {sys_type}")

            cs = sb.table('completions_segments').select('*').eq('affectation_id', a['id']).execute()
            for c in cs.data:
                print(f"    -> '{c['segment_value']}' = {c['completions']}")
