import { useState, useEffect } from 'react'

const API_URL = 'http://127.0.0.1:8000/prompt'

const Searchbar = () => {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [selected, setSelected] = useState(null)
  const [recommendations, setRecommendations] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Search iTunes 400ms after the user stops typing
  useEffect(() => {
    if (!query.trim()) {
      setResults([])
      return
    }

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=8`
        )
        const data = await res.json()
        setResults(data.results)
      } catch {
        setError('Could not reach iTunes')
      }
    }, 400)

    return () => clearTimeout(timer)
  }, [query])

  // Send the chosen song to the backend
  const handleSelect = async (track) => {
    setSelected(track)
    setResults([])
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
      if (!res.ok) throw new Error(`Server returned ${res.status}`)
      const data = await res.json()
      setRecommendations(data.recommendations)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container py-5" style={{ maxWidth: 720 }}>
      <h1 className="mb-4 text-center">Song Recommender</h1>

      {/* Search input + dropdown */}
      <div className="position-relative">
        <input
          type="text"
          className="form-control form-control-lg"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search for a song..."
        />

        {results.length > 0 && (
          <div
            className="list-group position-absolute w-100 shadow"
            style={{ zIndex: 10, maxHeight: 400, overflowY: 'auto' }}
          >
            {results.map((track) => (
              <button
                key={track.trackId}
                type="button"
                className="list-group-item list-group-item-action d-flex align-items-center gap-3"
                onClick={() => handleSelect(track)}
              >
                <img src={track.artworkUrl60} alt="" width={45} height={45} className="rounded" />
                <div className="text-start">
                  <div className="fw-semibold">{track.trackName}</div>
                  <small className="text-muted">{track.artistName}</small>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Selected song */}
      {selected && (
        <div className="alert alert-secondary mt-4 d-flex align-items-center gap-3">
          <img src={selected.artworkUrl60} alt="" width={45} height={45} className="rounded" />
          <div>
            Recommendations based on <strong>{selected.trackName}</strong> by {selected.artistName}
          </div>
        </div>
      )}

      {loading && (
        <div className="text-center my-4">
          <div className="spinner-border" role="status" />
          <p className="mt-2 text-muted">Finding recommendations...</p>
        </div>
      )}

      {error && <div className="alert alert-danger mt-3">{error}</div>}

      {/* Recommendation cards */}
      <div className="row g-3 mt-2">
        {recommendations.map((rec, i) => (
          <div key={i} className="col-12">
            <div className="card h-100 shadow-sm">
              <div className="row g-0">
                <div className="col-4 col-sm-3">
                  <img
                    src={rec.artwork_url}
                    alt={rec.song}
                    className="img-fluid rounded-start h-100"
                    style={{ objectFit: 'cover' }}
                  />
                </div>
                <div className="col-8 col-sm-9">
                  <div className="card-body">
                    <h5 className="card-title mb-1">
                      {rec.song}
                      {!rec.found && (
                        <span className="badge bg-secondary ms-2 fs-6">Not on iTunes</span>
                      )}
                    </h5>
                    <p className="card-subtitle text-muted mb-2">
                      {rec.artist}
                      {rec.album && ` · ${rec.album}`}
                    </p>
                    <p className="card-text small">{rec.reason}</p>

                    {rec.preview_url && (
                      <audio controls src={rec.preview_url} className="w-100 mb-2" />
                    )}

                    {rec.itunes_url && (
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-primary"
                        onClick={() => window.open(rec.itunes_url, '_blank', 'noopener')}
                      >
                        Open in iTunes
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default Searchbar