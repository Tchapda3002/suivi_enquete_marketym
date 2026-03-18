import os, httpx, asyncio
from dotenv import load_dotenv
load_dotenv('.env')
from supabase import create_client

sb = create_client(os.getenv('SUPABASE_URL'), os.getenv('SUPABASE_KEY'))
QUESTIONPRO_BASE_URL = 'https://api.questionpro.com/a/api/v2'
API_KEY = os.getenv('QUESTIONPRO_API_KEY')

# Surveys qui donnent "Autre" pour toutes les completions
problem_surveys = ['13444868', '13432523', '13432629', '13312677']

async def check():
    async with httpx.AsyncClient(timeout=60.0) as client:
        for sid in problem_surveys:
            print(f"\n=== Survey {sid} ===")
            # Get questions
            resp = await client.get(
                f'{QUESTIONPRO_BASE_URL}/surveys/{sid}/questions',
                headers={'api-key': API_KEY}
            )
            if resp.status_code != 200:
                print(f"  ERROR: status {resp.status_code}")
                continue
            questions = resp.json().get('response', [])

            # Chercher la question pays
            found = False
            for q in questions:
                text = q.get('text', '')
                qid = q.get('questionID', q.get('id', ''))
                if 'pays' in text.lower():
                    print(f"  Question pays: qid={qid} | '{text}'")
                    found = True

            if not found:
                print("  AUCUNE question avec 'pays' trouvee!")
                # Lister toutes les questions pour debug
                for q in questions[:5]:
                    print(f"  q: {q.get('questionID', q.get('id',''))} | {q.get('text', '')[:80]}")
                if len(questions) > 5:
                    print(f"  ... et {len(questions)-5} autres questions")

            # Verifier le matching avec le texte de la segmentation
            seg_text = "dans quel pays résidez-vous ?"
            matched = False
            for q in questions:
                if q.get('text', '').strip().lower() == seg_text:
                    print(f"  MATCH exact: qid={q.get('questionID', q.get('id',''))}")
                    matched = True
            if not matched:
                print(f"  PAS DE MATCH exact pour '{seg_text}'")

asyncio.run(check())
