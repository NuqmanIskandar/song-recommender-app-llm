import os
import json
import asyncio
import httpx
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, ValidationError
from openai import AsyncOpenAI
from dotenv import load_dotenv
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

NUM_SONGS = 5
ITUNES_URL = "https://itunes.apple.com/search"
PLACEHOLDER_ART = "https://placehold.co/600x600?text=No+Artwork"


class PromptRequest(BaseModel):
    song_name: str
    artist: str


class LLMSong(BaseModel):
    song: str
    artist: str
    reason: str


class LLMResponse(BaseModel):
    recommendations: list[LLMSong]


class SongRecommendation(BaseModel):
    song: str
    artist: str
    reason: str
    album: str | None = None
    artwork_url: str
    preview_url: str | None = None
    itunes_url: str | None = None
    found: bool  # False = placeholder / not on iTunes


class RecommendationResponse(BaseModel):
    recommendations: list[SongRecommendation]


app = FastAPI(title="Song Recommender V2")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

client = AsyncOpenAI(
    api_key=os.environ.get("KILOCODE_API_KEY"),
    base_url="https://api.kilo.ai/api/gateway/",
)


def placeholder(song: str = "Unknown Song", artist: str = "Unknown Artist",
                reason: str = "No recommendation available") -> SongRecommendation:
    return SongRecommendation(
        song=song, artist=artist, reason=reason,
        artwork_url=PLACEHOLDER_ART, found=False,
    )


async def get_song_from_itunes(http: httpx.AsyncClient, rec: LLMSong) -> SongRecommendation:
    """Look up one song on iTunes. Falls back to a placeholder if not found."""
    try:
        r = await http.get(ITUNES_URL, params={
            "term": f"{rec.song} {rec.artist}",
            "entity": "song",
            "limit": 5,
        })
        r.raise_for_status()
        results = r.json().get("results", [])
    except (httpx.HTTPError, ValueError):
        results = []

    if not results:
        return placeholder(rec.song, rec.artist, rec.reason)

    # Prefer a result whose artist matches what the LLM said
    artist_lower = rec.artist.lower()
    match = next(
        (t for t in results if artist_lower in t.get("artistName", "").lower()),
        results[0],
    )

    art = match.get("artworkUrl100")
    return SongRecommendation(
        song=match.get("trackName", rec.song),
        artist=match.get("artistName", rec.artist),
        reason=rec.reason,
        album=match.get("collectionName"),
        # iTunes returns 100x100; swap in a bigger size
        artwork_url=art.replace("100x100bb", "600x600bb") if art else PLACEHOLDER_ART,
        preview_url=match.get("previewUrl"),
        itunes_url=match.get("trackViewUrl"),
        found=True,
    )


async def get_songs_api(recs: list[LLMSong]) -> list[SongRecommendation]:
    """Fetch all songs in parallel, then pad/trim to exactly NUM_SONGS."""
    recs = recs[:NUM_SONGS]
    async with httpx.AsyncClient(timeout=8.0) as http:
        songs = await asyncio.gather(*(get_song_from_itunes(http, r) for r in recs))
    songs = list(songs)
    while len(songs) < NUM_SONGS:
        songs.append(placeholder())
    return songs


@app.get("/")
def root():
    return {"status": "Fastapi is running"}


@app.post("/prompt", response_model=RecommendationResponse)
async def prompt_ai(request: PromptRequest):
    system_prompt = (
        f"You are a music recommendation assistant. Given a song and artist, "
        f"suggest {NUM_SONGS} similar songs that exist on streaming services. "
        "Respond ONLY with valid JSON, no markdown fences, no preamble, "
        "matching exactly this shape:\n"
        '{"recommendations": [{"song": "...", "artist": "...", "reason": "..."}]}'
    )
    user_prompt = f"Song: {request.song_name}\nArtist: {request.artist}"

    try:
        response = await client.chat.completions.create(
            model="nvidia/nemotron-3-ultra-550b-a55b:free",
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"LLM request failed: {e}")

    content = response.choices[0].message.content or ""
    try:
        llm_recs = LLMResponse(**json.loads(content)).recommendations
    except (json.JSONDecodeError, TypeError, ValidationError):
        llm_recs = []  # still return 5 placeholders instead of erroring

    songs = await get_songs_api(llm_recs)
    return RecommendationResponse(recommendations=songs)