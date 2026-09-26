import { useState, useEffect, useRef } from 'react'
import './Searchbar.css'

const API_URL = 'http://127.0.0.1:8000/prompt'

// iTunes artwork URLs end in e.g. "100x100bb.jpg" — swap in a bigger size for crisp images
const hiRes = (url, size = 600) =>
  url ? url.replace(/\d+x\d+bb/, `${size}x${size}bb`) : url

const PlayIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" fill="currentColor" /></svg>
)
const PauseIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor" /></svg>
)
const VolumeIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" />
    <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
)
const MuteIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" />
    <path d="M16 9.5l5 5M21 9.5l-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
)

// Load the saved volume (0–1), falling back to 80%
const loadVolume = () => {
  try {
    const v = parseFloat(localStorage.getItem('sr-volume'))
    return Number.isFinite(v) ? v : 0.8
  } catch {
    return 0.8
  }
}

const SearchIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
    <path d="M16 16l4.5 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
)

const Searchbar = () => {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [selected, setSelected] = useState(null)
  const [recommendations, setRecommendations] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [playing, setPlaying] = useState(null)
  const [progress, setProgress] = useState(0)
  const [volume, setVolume] = useState(loadVolume)
  const [muted, setMuted] = useState(false)

  const audioRef = useRef(null)
  const boxRef = useRef(null)

  // One shared audio element, so this volume applies to every preview
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume
      audioRef.current.muted = muted
    }
    try {
      localStorage.setItem('sr-volume', String(volume))
    } catch {
      /* storage unavailable — volume still works for this session */
    }
  }, [volume, muted])

  const isSilent = muted || volume === 0

  // Search iTunes 400ms after the user stops typing; cancel stale requests
  useEffect(() => {
    if (!query.trim()) {
      setResults([])
      return
    }
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=8`,
          { signal: controller.signal }
        )
        const data = await res.json()
        setResults(data.results ?? [])
        setActiveIndex(-1)
        setOpen(true)
        setError('')
      } catch (err) {
        if (err.name !== 'AbortError') {
          setError("Couldn't reach iTunes. Check your connection and try again.")
        }
      }
    }, 400)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [query])

  // Close the dropdown when clicking outside it
  useEffect(() => {
    const onClick = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const stopAudio = () => {
    audioRef.current?.pause()
    setPlaying(null)
    setProgress(0)
  }

  const togglePlay = (i, url) => {
    const audio = audioRef.current
    if (!audio) return
    if (playing === i) {
      stopAudio()
      return
    }
    audio.src = url
    audio.currentTime = 0
    audio.play().catch(() => setPlaying(null))
    setPlaying(i)
    setProgress(0)
  }

  // Send the chosen song to the backend
  const handleSelect = async (track) => {
    stopAudio()
    setSelected(track)
    setResults([])
    setOpen(false)
    setQuery('')
    setRecommendations([])
    setError('')
    setLoading(true)

    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          song_name: track.trackName,
          artist: track.artistName,
        }),
      })
      if (!res.ok) throw new Error(`The recommender returned an error (${res.status}). Check the backend logs and try again.`)
      const data = await res.json()
      setRecommendations(data.recommendations ?? [])
    } catch (err) {
      setError(
        err.message === 'Failed to fetch'
          ? "Couldn't reach the recommender. Make sure the backend is running on port 8000."
          : err.message
      )
    } finally {
      setLoading(false)
    }
  }

  const onKeyDown = (e) => {
    if (!open || results.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => (i + 1) % results.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => (i <= 0 ? results.length - 1 : i - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      handleSelect(results[activeIndex >= 0 ? activeIndex : 0])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  const showDropdown = open && results.length > 0

  return (
    <div className="sr">
      {selected && (
        <div
          key={selected.trackId}
          className="sr-ambient"
          style={{ backgroundImage: `url(${hiRes(selected.artworkUrl100 || selected.artworkUrl60, 200)})` }}
          aria-hidden="true"
        />
      )}

      <main className="sr-inner">
        <header className="sr-top">
          <span>Song Recommender</span>

          <div className="sr-volume">
            <button
              type="button"
              className="sr-mute"
              onClick={() => {
                if (volume === 0) {
                  setVolume(0.8)
                  setMuted(false)
                } else {
                  setMuted((m) => !m)
                }
              }}
              aria-label={isSilent ? 'Unmute previews' : 'Mute previews'}
            >
              {isSilent ? <MuteIcon /> : <VolumeIcon />}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={muted ? 0 : volume}
              onChange={(e) => {
                setVolume(parseFloat(e.target.value))
                setMuted(false)
              }}
              className="sr-slider"
              style={{ '--fill': `${(muted ? 0 : volume) * 100}%` }}
              aria-label="Preview volume"
            />
          </div>
        </header>

        {!selected && (
          <h1 className="sr-hero">
            Start with a song
            <br />
            you can't stop playing.
          </h1>
        )}

        {/* Search */}
        <div className="sr-search" ref={boxRef}>
          <span className="sr-search-icon"><SearchIcon /></span>
          <input
            type="text"
            className="sr-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => results.length && setOpen(true)}
            onKeyDown={onKeyDown}
            placeholder={selected ? 'Try another song' : 'Search a song or artist'}
            role="combobox"
            aria-expanded={showDropdown}
            aria-controls="sr-results"
            aria-activedescendant={activeIndex >= 0 ? `sr-opt-${activeIndex}` : undefined}
            aria-label="Search for a song"
            autoComplete="off"
          />

          {showDropdown && (
            <ul className="sr-dropdown" id="sr-results" role="listbox">
              {results.map((track, i) => (
                <li
                  key={track.trackId}
                  id={`sr-opt-${i}`}
                  role="option"
                  aria-selected={i === activeIndex}
                  className={`sr-option${i === activeIndex ? ' is-active' : ''}`}
                  onMouseEnter={() => setActiveIndex(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleSelect(track)}
                >
                  <img src={track.artworkUrl60} alt="" className="sr-option-art" />
                  <span className="sr-option-text">
                    <span className="sr-option-title">{track.trackName}</span>
                    <span className="sr-option-artist">{track.artistName}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Seed song */}
        {selected && (
          <section className="sr-seed">
            <img
              src={hiRes(selected.artworkUrl100 || selected.artworkUrl60)}
              alt={`${selected.collectionName ?? selected.trackName} cover`}
              className="sr-seed-art"
            />
            <div className="sr-seed-text">
              <h1 className="sr-seed-title">{selected.trackName}</h1>
              <p className="sr-seed-artist">{selected.artistName}</p>
            </div>
          </section>
        )}

        {error && <p className="sr-error" role="alert">{error}</p>}

        {/* Loading skeleton */}
        {loading && (
          <div className="sr-list" aria-live="polite">
            <span className="sr-visually-hidden">Finding recommendations…</span>
            {[0, 1, 2].map((i) => (
              <div key={i} className="sr-row sr-skeleton">
                <div className="sr-art" />
                <div className="sr-body">
                  <div className="sr-bar" style={{ width: '45%' }} />
                  <div className="sr-bar" style={{ width: '30%' }} />
                  <div className="sr-bar" style={{ width: '80%' }} />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Recommendations */}
        {recommendations.length > 0 && (
          <>
            <h2 className="sr-list-heading">Songs to play next</h2>
            <ul className="sr-list">
              {recommendations.map((rec, i) => (
                <li key={i} className="sr-row" style={{ '--i': i }}>
                  <div className="sr-art">
                    {rec.artwork_url && <img src={hiRes(rec.artwork_url, 200)} alt="" />}
                    {rec.preview_url && (
                      <button
                        type="button"
                        className={`sr-play${playing === i ? ' is-playing' : ''}`}
                        onClick={() => togglePlay(i, rec.preview_url)}
                        aria-label={playing === i ? `Pause ${rec.song}` : `Play preview of ${rec.song}`}
                      >
                        {playing === i ? <PauseIcon /> : <PlayIcon />}
                      </button>
                    )}
                  </div>

                  <div className="sr-body">
                    <h3 className="sr-title">{rec.song}</h3>
                    <p className="sr-meta">
                      {rec.artist}
                      {rec.album && <span className="sr-album">, {rec.album}</span>}
                      {!rec.found && <span className="sr-missing">Not on iTunes</span>}
                    </p>
                    {rec.reason && <p className="sr-reason">{rec.reason}</p>}
                  </div>

                  {rec.itunes_url && (
                    <a className="sr-link" href={rec.itunes_url} target="_blank" rel="noopener noreferrer">
                      Open in iTunes
                    </a>
                  )}

                  {playing === i && (
                    <span className="sr-progress" style={{ transform: `scaleX(${progress})` }} aria-hidden="true" />
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </main>

      <audio
        ref={audioRef}
        onTimeUpdate={(e) => setProgress(e.currentTarget.currentTime / (e.currentTarget.duration || 30))}
        onEnded={stopAudio}
      />
    </div>
  )
}

export default Searchbar