import { useState, useEffect } from 'react';

function TopicsList({ rdv, onClose }) {
  const [topics, setTopics] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);
  const [limit] = useState(20);

  useEffect(() => {
    loadTopics();
  }, [page]);

  const loadTopics = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await rdv.api.listTopics(page, limit);
      setTopics(response.topics);
      setPagination(response.pagination);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    loadTopics();
  };

  const handlePrevPage = () => {
    if (page > 1) {
      setPage(page - 1);
    }
  };

  const handleNextPage = () => {
    if (pagination?.hasMore) {
      setPage(page + 1);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content topics-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Active Topics</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          {error && (
            <div className="error-message" style={{ marginBottom: '1rem' }}>
              Error: {error}
            </div>
          )}

          {loading ? (
            <div className="loading-message">Loading topics...</div>
          ) : (
            <>
              {topics.length === 0 ? (
                <div className="empty-message">
                  No active topics found. Be the first to create one!
                </div>
              ) : (
                <div className="topics-list">
                  {topics.map((topic) => (
                    <div key={topic.topic} className="topic-item">
                      <div className="topic-name">{topic.topic}</div>
                      <div className="topic-count">
                        {topic.count} {topic.count === 1 ? 'peer' : 'peers'}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {pagination && (
                <div className="pagination">
                  <button
                    onClick={handlePrevPage}
                    disabled={page === 1}
                    className="pagination-button"
                  >
                    ← Previous
                  </button>
                  <span className="pagination-info">
                    Page {pagination.page} of {Math.ceil(pagination.total / pagination.limit)}
                    {' '}({pagination.total} total)
                  </span>
                  <button
                    onClick={handleNextPage}
                    disabled={!pagination.hasMore}
                    className="pagination-button"
                  >
                    Next →
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        <div className="modal-footer">
          <button onClick={handleRefresh} className="button button-secondary">
            🔄 Refresh
          </button>
          <button onClick={onClose} className="button button-primary">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default TopicsList;
