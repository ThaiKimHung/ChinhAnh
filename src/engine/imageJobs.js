export function createImageJobGuard() {
  let activeId = null;
  let revision = 0;

  return {
    get activeId() {
      return activeId;
    },
    select(id) {
      activeId = id;
      revision++;
    },
    invalidate() {
      revision++;
    },
    start() {
      return { id: activeId, revision };
    },
    isCurrent(job) {
      return job.id !== null && job.id === activeId && job.revision === revision;
    },
  };
}
