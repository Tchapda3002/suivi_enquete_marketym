import os, httpx, asyncio
from dotenv import load_dotenv
load_dotenv('.env')

QUESTIONPRO_BASE_URL = 'https://api.questionpro.com/a/api/v2'
API_KEY = os.getenv('QUESTIONPRO_API_KEY')

async def check():
    async with httpx.AsyncClient(timeout=60.0) as client:
        # Verifier l'ordre des questions retournees par fetch_survey_questions pour 13432523
        resp = await client.get(
            f'{QUESTIONPRO_BASE_URL}/surveys/13432523/questions',
            headers={'api-key': API_KEY}
        )
        questions = resp.json().get('response', [])

        # Simuler fetch_survey_questions (filtre les questions avec answers)
        filtered = []
        for q in questions:
            answers = q.get('answers', q.get('answerChoices', []))
            if answers:
                filtered.append({
                    'id': str(q.get('questionID', q.get('id', ''))),
                    'text': q.get('text', ''),
                    'num_answers': len(answers),
                    'sample_answers': [a.get('text','') for a in answers[:3]]
                })

        # Simuler le match souple avec keyword "pays"
        keyword = "pays"
        print("Questions contenant 'pays' dans l'ordre:")
        for q in filtered:
            if keyword in q['text'].lower():
                print(f"  qid={q['id']} | {q['text']}")
                print(f"    {q['num_answers']} reponses: {q['sample_answers']}...")

        # Verifier aussi les reponses du survey pour voir quel question_id porte les pays
        resp = await client.get(
            f'{QUESTIONPRO_BASE_URL}/surveys/13432523/responses',
            params={'page': 1, 'perPage': 5},
            headers={'api-key': API_KEY}
        )
        responses = resp.json().get('response', [])
        pays_connus = ['cameroun', 'sénégal', 'mali', 'togo', 'bénin', 'niger',
                       'burkina', 'côte', 'tchad', 'gabon', 'congo', 'guinée', 'rdc']

        print("\nDans les reponses, question qui donne un pays:")
        for r in responses:
            for rs in r.get('responseSet', []):
                ans = rs.get('answerValues', [])
                if ans:
                    ans_text = ans[0].get('answerText', '')
                    if any(p in ans_text.lower() for p in pays_connus):
                        print(f"  qid={rs['questionID']} -> '{ans_text}'")
                        break  # Une seule par reponse

asyncio.run(check())
