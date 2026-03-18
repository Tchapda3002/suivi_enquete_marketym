import os, httpx, asyncio
from dotenv import load_dotenv
load_dotenv('.env')
from supabase import create_client

sb = create_client(os.getenv('SUPABASE_URL'), os.getenv('SUPABASE_KEY'))
QUESTIONPRO_BASE_URL = 'https://api.questionpro.com/a/api/v2'
API_KEY = os.getenv('QUESTIONPRO_API_KEY')

async def check():
    # Toutes les enquetes avec segmentations
    enquetes = sb.table('enquetes').select('id, nom, survey_id').execute()
    segs = sb.table('segmentations').select('id, question_id, question_text, enquete_id').execute()
    affs = sb.table('affectations').select('id, survey_id, enquete_id').execute()

    # Map enquete_id -> segmentations
    seg_by_enquete = {}
    for s in segs.data:
        seg_by_enquete.setdefault(s['enquete_id'], []).append(s)

    # Map enquete_id -> enquete
    enq_map = {e['id']: e for e in enquetes.data}

    # Trouver les affectations ancien systeme avec segmentations
    problemes = []
    for a in affs.data:
        enq = enq_map.get(a['enquete_id'])
        if not enq:
            continue
        if str(a['survey_id']) == str(enq['survey_id']):
            continue  # nouveau systeme, pas de probleme
        enq_segs = seg_by_enquete.get(a['enquete_id'], [])
        if not enq_segs:
            continue  # pas de segmentation

        problemes.append({
            'aff_id': a['id'],
            'aff_survey_id': a['survey_id'],
            'enquete_nom': enq['nom'],
            'enquete_survey_id': enq['survey_id'],
            'segs': enq_segs
        })

    # Pour chaque affectation probleme, verifier le matching
    async with httpx.AsyncClient(timeout=60.0) as client:
        seen_surveys = {}
        for p in problemes:
            sid = str(p['aff_survey_id'])
            if sid not in seen_surveys:
                resp = await client.get(
                    f'{QUESTIONPRO_BASE_URL}/surveys/{sid}/questions',
                    headers={'api-key': API_KEY}
                )
                if resp.status_code == 200:
                    qs = resp.json().get('response', [])
                    seen_surveys[sid] = {q.get('text', '').strip().lower(): q.get('questionID', q.get('id', '')) for q in qs}
                else:
                    seen_surveys[sid] = {}

            indiv_questions = seen_surveys[sid]
            for seg in p['segs']:
                seg_text = seg['question_text'].strip().lower()
                if seg_text not in indiv_questions:
                    # Chercher le nom du survey individuel
                    resp2 = await client.get(
                        f'{QUESTIONPRO_BASE_URL}/surveys/{sid}',
                        headers={'api-key': API_KEY}
                    )
                    survey_name = resp2.json().get('response', {}).get('name', 'N/A') if resp2.status_code == 200 else 'N/A'
                    print(f"MISMATCH dans '{p['enquete_nom']}':")
                    print(f"  Survey individuel: {sid} ('{survey_name}')")
                    print(f"  Segmentation attendue: '{seg['question_text']}'")
                    print(f"  Questions dispo dans le survey individuel:")
                    for qt, qid in indiv_questions.items():
                        if 'pays' in qt or any(word in qt for word in seg_text.split() if len(word) > 3):
                            print(f"    -> qid={qid} | '{qt}'")
                    print()

asyncio.run(check())
