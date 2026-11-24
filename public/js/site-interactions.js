(() => {
  let initialHashHandled = false;

  function alignInitialHash() {
    if (initialHashHandled || !window.location.hash) return;
    const target = document.getElementById(decodeURIComponent(window.location.hash.slice(1)));
    if (!target || !document.querySelector('details.team-roster')) return;
    initialHashHandled = true;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      target.scrollIntoView({ behavior: 'instant', block: 'start' });
    }));
  }

  function setupNavigation() {
    const compact = window.matchMedia('(max-width: 960px)');
    const openButton = () => document.querySelector('.nav-toggle[aria-expanded="true"]');

    function setOpen(button, open, { instant = false, returnFocus = false } = {}) {
      const header = button.closest('.hdr');
      const nav = document.getElementById(button.getAttribute('aria-controls'));
      header.toggleAttribute('data-menu-instant', instant);
      button.setAttribute('aria-expanded', String(open));
      if (returnFocus) button.focus({ preventScroll: true });
      nav.inert = compact.matches && !open;
    }

    // The template runtime can replace the header when it refreshes its markup.
    document.addEventListener('click', (event) => {
      const toggle = event.target.closest('.nav-toggle');
      const button = openButton();
      const instant = event.detail === 0;
      if (toggle) {
        setOpen(toggle, toggle !== button, { instant });
        return;
      }
      if (!button) return;

      const link = event.target.closest('#home-nav a');
      if (link) {
        const href = link.getAttribute('href');
        const target = href.startsWith('#') && document.getElementById(href.slice(1));
        if (target) {
          target.setAttribute('tabindex', '-1');
          target.focus({ preventScroll: true });
        }
        setOpen(button, false, { instant });
      } else if (!button.closest('.hdr').contains(event.target)) {
        setOpen(button, false, { returnFocus: document.getElementById('home-nav').contains(document.activeElement) });
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      const button = openButton();
      if (!button) return;
      event.preventDefault();
      setOpen(button, false, { instant: true, returnFocus: true });
    });

    document.addEventListener('focusout', (event) => {
      const button = openButton();
      if (!button || !event.relatedTarget) return;
      const header = button.closest('.hdr');
      if (header.contains(event.target) && !header.contains(event.relatedTarget)) {
        setOpen(button, false, { instant: true });
      }
    });

    compact.addEventListener('change', () => {
      const button = document.querySelector('.nav-toggle');
      const nav = document.getElementById('home-nav');
      if (!button || !nav) return;
      setOpen(button, false, { instant: true, returnFocus: compact.matches && nav.contains(document.activeElement) });
    });

    document.documentElement.setAttribute('data-menu-ready', '');
  }

  setupNavigation();
  if (window.location.hash) {
    const observer = new MutationObserver(() => {
      alignInitialHash();
      if (initialHashHandled) observer.disconnect();
    });
    alignInitialHash();
    if (!initialHashHandled) {
      observer.observe(document.documentElement, { childList: true, subtree: true });
    }
  }
})();
