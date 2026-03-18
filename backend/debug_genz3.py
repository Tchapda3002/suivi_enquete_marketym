import os, httpx, asyncio
from dotenv import load_dotenv
load_dotenv('.env')
from supabase import create_client

sb = create_client(os.getenv('SUPABASE_URL'), os.getenv('SUPABASE_KEY'))
QUESTIONPRO_BASE_URL = 'https://api.questionpro.com/a/api/v2'
API_KEY = os.getenv('QUESTIONPRO_API_KEY')

# Toutes les enquetes et leurs surveys
enquetes = sb.table('enquetes').select('id, nom, survey_id').execute()
print("=== Enquetes ===")
for e in enquetes.data:
    print(f"  {e['nom']} | survey_id={e['survey_id']} | id={e['id'][:8]}")

print()

# Les surveys "probleme" - verifions a quel survey principal ils correspondent
problem_surveys = {
    '13432523': 'aff 5a3abead (19 completions, tout Autre)',
    '13432629': 'aff 14b27c5a (54 completions, tout Autre)',
    '13312677': 'aff 1ff857dc (37 completions, tout Autre)',
}

async def check():
    async with httpx.AsyncClient(timeout=60.0) as client:
        for sid, desc in problem_surveys.items():
            resp = await client.get(
                f'{QUESTIONPRO_BASE_URL}/surveys/{sid}',
                headers={'api-key': API_KEY}
            )
            if resp.status_code == 200:
                data = resp.json().get('response', {})
                name = data.get('name', 'N/A')
                print(f"Survey {sid} ({desc}): '{name}'")
            else:
                print(f"Survey {sid}: HTTP {resp.status_code}")

        # Aussi checker le survey principal GENZ
        resp = await client.get(
            f'{QUESTIONPRO_BASE_URL}/surveys/13442593',
            headers={'api-key': API_KEY}
        )
        if resp.status_code == 200:
            name = resp.json().get('response', {}).get('name', '')
            print(f"\nSurvey principal GENZ 13442593: '{name}'")

asyncio.run(check())

# Verifier les quotas pour Cote d'Ivoire
print("\n=== Quotas GENZ ===")
genz_id = None
for e in enquetes.data:
    if 'genz' in e['nom'].lower():
        genz_id = e['id']
        break

if genz_id:
    quotas = sb.table('quotas').select('*').eq('enquete_id', genz_id).execute()
    for q in quotas.data:
        print(f"  quota: '{q['segment_value']}' | objectif={q.get('objectif',0)} | completions={q.get('completions',0)}")
