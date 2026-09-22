import os
import json
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

class PromptRequest(BaseModel):
    song_name: str
    artist: str

class SongRecommendation(BaseModel):
    song: str
    artist: str
    reason: str

class RecommendationResponse(BaseModel):
    recommendations: list[SongRecommendation]

app = FastAPI(title="Song Recommender V2")

api_key = os.environ.get("KILOCODE_API_KEY")

client = OpenAI(
    api_key=api_key,
    base_url="https://api.kilo.ai/api/gateway/",
)

@app.get("/")
def root():
    return {"status": "Fastapi is running"}

# llm api
@app.post("/prompt", response_model=RecommendationResponse)
def prompt_ai(request: PromptRequest):
    system_prompt = (
        "You are a music recommendation assistant. Given a song and artist, "
        "suggest 5 similar songs. Respond ONLY with valid JSON, no markdown "
        "fences, no preamble, matching exactly this shape:\n"
        '{"recommendations": [{"song": "...", "artist": "...", "reason": "..."}]}'
    )
    user_prompt = f"Song: {request.song_name}\nArtist: {request.artist}"

    try:
        response = client.chat.completions.create(
            model="nvidia/nemotron-3-ultra-550b-a55b:free",
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"LLM request failed: {e}")

    content = response.choices[0].message.content

    try:
        parsed = json.loads(content)
        return RecommendationResponse(**parsed)
    except (json.JSONDecodeError, TypeError) as e:
        raise HTTPException(status_code=502, detail=f"Malformed LLM response: {e}")