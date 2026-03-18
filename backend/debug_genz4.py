import os, httpx, asyncio
from dotenv import load_dotenv
load_dotenv('.env')

QUESTIONPRO_BASE_URL = 'https://api.questionpro.com/a/api/v2'
API_KEY = os.getenv('QUESTIONPRO_API_KEY')

# Survey ancien 13432523 - verifier si la question "Dans quel pays est basee..." a les memes reponses pays
async def check():
    async with httpx.AsyncClient(timeout=60.0) as client:
        # Survey principal GENZ - question "Dans quel pays residez-vous ?"
        resp = await client.get(
            f'{QUESTIONPRO_BASE_URL}/surveys/13442593/questions',
            headers={'api-key': API_KEY}
        )
        main_questions = resp.json().get('response', [])
        print("=== Survey principal 13442593 ===")
        for q in main_questions:
            if 'pays' in q.get('text', '').lower() and 'résidez' in q.get('text', '').lower():
                print(f"  qid={q['questionID']} | {q['text']}")
                answers = q.get('answers', q.get('answerChoices', []))
                print(f"  Reponses ({len(answers)}): {[a.get('text','') for a in answers[:5]]}...")
                break

        # Survey ancien 13432523 - toutes les questions avec "pays"
        resp = await client.get(
            f'{QUESTIONPRO_BASE_URL}/surveys/13432523/questions',
            headers={'api-key': API_KEY}
        )
        old_questions = resp.json().get('response', [])
        print("\n=== Survey ancien 13432523 ===")
        for q in old_questions:
            if 'pays' in q.get('text', '').lower():
                print(f"  qid={q['questionID']} | {q['text']}")
                answers = q.get('answers', q.get('answerChoices', []))
                print(f"  Reponses ({len(answers)}): {[a.get('text','') for a in answers[:5]]}...")

        # Verifier une reponse du survey 13432523 pour voir quelle question contient les pays
        resp = await client.get(
            f'{QUESTIONPRO_BASE_URL}/surveys/13432523/responses',
            params={'page': 1, 'perPage': 2},
            headers={'api-key': API_KEY}
        )
        responses = resp.json().get('response', [])
        if responses:
            print(f"\n=== Premiere reponse survey 13432523 ===")
            r = responses[0]
            for rs in r.get('responseSet', []):
                qid = rs.get('questionID', '')
                ans = rs.get('answerValues', [])
                if ans:
                    ans_text = ans[0].get('answerText', '')
                    # Chercher si c'est un nom de pays
                    pays_connus = ['cameroun', 'sénégal', 'mali', 'togo', 'bénin', 'niger', 'burkina', 'côte', 'tchad', 'gabon', 'congo', 'guinée']
                    if any(p in ans_text.lower() for p in pays_connus):
                        print(f"  PAYS TROUVE: qid={qid} -> '{ans_text}'")

asyncio.run(check())
