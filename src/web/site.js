import { initializeLocale } from './locale.js';

import { siteEnglish } from './site-messages.js';

initializeLocale(siteEnglish);

for (const browser of document.querySelectorAll('.structure-browser')) {
  const tablist = browser.querySelector('.structure-tabs');
  const tabs = Array.from(tablist.querySelectorAll('.structure-tab'));

  function selectTab(selected) {
    for (const tab of tabs) {
      const active = tab === selected;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
      document.getElementById(tab.getAttribute('aria-controls')).hidden = !active;
    }
  }

  for (const tab of tabs) {
    tab.addEventListener('click', () => selectTab(tab));
  }

  tablist.addEventListener('keydown', event => {
    const current = tabs.indexOf(event.target);
    let next;
    switch (event.key) {
      case 'ArrowUp':
      case 'ArrowLeft':
        next = (current + tabs.length - 1) % tabs.length;
        break;
      case 'ArrowDown':
      case 'ArrowRight':
        next = (current + 1) % tabs.length;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = tabs.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    selectTab(tabs[next]);
    tabs[next].focus();
  });
}


const sponsorDialog = document.querySelector('#sponsor-dialog');
const sponsorTrigger = document.querySelector('[data-sponsor-trigger]');
if (sponsorDialog && sponsorTrigger) {
  sponsorTrigger.addEventListener('click', () => {
    sponsorDialog.showModal();
    document.body.classList.add('sponsor-open');
  });
  sponsorDialog.querySelector('[data-sponsor-close]').addEventListener('click', () => sponsorDialog.close());
  sponsorDialog.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const controls = [...sponsorDialog.querySelectorAll('button, a[href]')];
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
  sponsorDialog.addEventListener('click', event => {
    const rect = sponsorDialog.getBoundingClientRect();
    if (event.target === sponsorDialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) sponsorDialog.close();
  });
  sponsorDialog.addEventListener('close', () => {
    document.body.classList.remove('sponsor-open');
    sponsorTrigger.focus({preventScroll: true});
  });
}
