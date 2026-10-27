(() => {
  const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function enhanceRoster(details) {
    if (details.dataset.enhanced) return;
    const summary = details.querySelector('summary');
    const content = details.querySelector('.team-roster__content');
    if (!summary || !content) return;
    details.dataset.enhanced = 'true';

    summary.addEventListener('click', (event) => {
      if (reducedMotion()) return;
      event.preventDefault();
      if (details.dataset.animating) return;

      const start = details.getBoundingClientRect().height;
      const opening = !details.open;
      if (opening) details.open = true;
      const end = opening
        ? summary.getBoundingClientRect().height + content.scrollHeight + 2
        : summary.getBoundingClientRect().height + 2;

      details.dataset.animating = 'true';
      details.style.height = `${start}px`;
      const animation = details.animate(
        [{ height: `${start}px` }, { height: `${end}px` }],
        { duration: 420, easing: 'cubic-bezier(.2,.75,.25,1)' }
      );
      animation.onfinish = () => {
        if (!opening) details.open = false;
        details.style.removeProperty('height');
        delete details.dataset.animating;
      };
      animation.oncancel = () => {
        details.style.removeProperty('height');
        delete details.dataset.animating;
      };
    });
  }

  function findRoster() {
    document.querySelectorAll('details.team-roster').forEach(enhanceRoster);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', findRoster, { once: true });
  } else {
    findRoster();
  }
  new MutationObserver(findRoster).observe(document.documentElement, { childList: true, subtree: true });
})();
