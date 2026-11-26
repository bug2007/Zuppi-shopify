import { Component } from '@theme/component';

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

/** @param {number} value */
const twoDigits = (value) => String(value).padStart(2, '0');

/**
 * Adds auto-rotation, a counter and progress bars to a product list carousel.
 * The scrolling itself stays with the theme's slideshow component.
 *
 * @typedef {Object} SaleCarouselRefs
 * @property {HTMLElement} [nav]
 * @property {HTMLElement} [counter]
 * @property {HTMLElement} [bars]
 * @property {HTMLButtonElement} [toggle]
 *
 * @extends {Component<SaleCarouselRefs>}
 */
class SaleCarousel extends Component {
  #controller = new AbortController();
  /** @type {HTMLElement | null} */
  #scroller = null;
  /** @type {ResizeObserver | undefined} */
  #resizeObserver;
  /** @type {IntersectionObserver | undefined} */
  #visibilityObserver;
  /** @type {number | undefined} */
  #timer;
  #frame = 0;
  #onScreen = false;
  #index = 0;
  #positions = 1;

  connectedCallback() {
    super.connectedCallback();
    this.#controller = new AbortController();
    this.#setup(this.#controller.signal);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.#controller.abort();
    this.#resizeObserver?.disconnect();
    this.#visibilityObserver?.disconnect();
    clearInterval(this.#timer);
    cancelAnimationFrame(this.#frame);
  }

  updatedCallback() {
    super.updatedCallback();
    this.#scheduleRender();
  }

  /** @param {Event} [event] */
  previous(event) {
    event?.preventDefault();
    this.#goTo(this.#index - 1);
    this.#restartTimer();
  }

  /** @param {Event} [event] */
  next(event) {
    event?.preventDefault();
    this.#goTo(this.#index + 1);
    this.#restartTimer();
  }

  toggleAutoplay() {
    this.#setPaused(!this.hasAttribute('paused'));
    this.#restartTimer();
  }

  /** @param {AbortSignal} signal */
  async #setup(signal) {
    await customElements.whenDefined('slideshow-component');
    if (signal.aborted) return;

    this.#scroller = this.querySelector('slideshow-slides');
    if (!this.#scroller) return;

    this.#scroller.addEventListener('scroll', this.#scheduleRender, { passive: true, signal });
    this.refs.bars?.addEventListener('click', this.#handleBarClick, { signal });

    this.#resizeObserver = new ResizeObserver(this.#scheduleRender);
    this.#resizeObserver.observe(this.#scroller);

    this.#visibilityObserver = new IntersectionObserver(([entry]) => {
      this.#onScreen = Boolean(entry?.isIntersecting);
    });
    this.#visibilityObserver.observe(this);

    // Visitors who prefer reduced motion start paused and can still press play
    if (reducedMotion.matches) this.#setPaused(true);

    this.#render();
    this.#restartTimer();
  }

  /** @param {boolean} paused */
  #setPaused(paused) {
    this.toggleAttribute('paused', paused);
    const label = paused ? this.dataset.playLabel : this.dataset.pauseLabel;
    if (label) this.refs.toggle?.setAttribute('aria-label', label);
  }

  #restartTimer() {
    clearInterval(this.#timer);
    const seconds = Number(this.dataset.autoplay);
    if (!seconds) return;

    this.#timer = window.setInterval(() => {
      const busy = this.matches(':hover') || this.querySelector(':focus-visible') !== null;
      if (busy || this.hasAttribute('paused') || document.hidden || !this.#onScreen) return;
      if (this.#positions > 1) this.#goTo(this.#index + 1);
    }, seconds * 1000);
  }

  /**
   * Scrolls to a position, wrapping around at both ends.
   * @param {number} index
   */
  #goTo(index) {
    const slideshow = /** @type {import('@theme/slideshow').Slideshow | null} */ (
      this.querySelector('slideshow-component')
    );
    const target = (index + this.#positions) % this.#positions;
    slideshow?.select(target, undefined, { animate: !reducedMotion.matches });
  }

  /** @param {Event} event */
  #handleBarClick = (event) => {
    if (!(event.target instanceof HTMLElement)) return;
    const { index } = event.target.dataset;
    if (index === undefined) return;

    this.#goTo(Number(index));
    this.#restartTimer();
  };

  #scheduleRender = () => {
    cancelAnimationFrame(this.#frame);
    this.#frame = requestAnimationFrame(() => this.#render());
  };

  #render() {
    const scroller = this.#scroller;
    if (!scroller) return;

    const slides = /** @type {HTMLElement[]} */ (
      Array.from(scroller.querySelectorAll(':scope > slideshow-slide:not([hidden])'))
    );
    const [first, second] = slides;
    if (!first || !first.offsetWidth) return;

    const total = slides.length;
    const step = second ? Math.abs(second.offsetLeft - first.offsetLeft) : first.offsetWidth;
    const gap = step - first.offsetWidth;
    const visible = Math.min(total, Math.max(1, Math.floor((scroller.clientWidth + gap + 1) / step)));
    const scrolled = Math.abs(scroller.scrollLeft);
    const maxScroll = scroller.scrollWidth - scroller.clientWidth;

    this.#positions = total - visible + 1;
    this.#index =
      maxScroll > 0 && scrolled >= maxScroll - 2
        ? this.#positions - 1
        : Math.min(this.#positions - 1, Math.round(scrolled / step));

    const { nav, counter, bars } = this.refs;
    const single = this.#positions <= 1;
    if (nav) nav.hidden = single;
    if (counter) {
      const start = twoDigits(this.#index + 1);
      const range = visible > 1 ? `${start}–${twoDigits(this.#index + visible)}` : start;
      counter.textContent = `${range} / ${twoDigits(total)}`;
    }
    if (bars) {
      bars.hidden = single;
      if (bars.children.length !== this.#positions) this.#buildBars(bars);
      Array.from(bars.children).forEach((bar, i) => bar.setAttribute('aria-current', String(i === this.#index)));
    }
  }

  /** @param {HTMLElement} container */
  #buildBars(container) {
    const template = this.dataset.slideLabel ?? '';
    const bars = Array.from({ length: this.#positions }, (_, i) => {
      const bar = document.createElement('button');
      bar.type = 'button';
      bar.className = 'sale-carousel__bar';
      bar.dataset.index = String(i);
      bar.setAttribute('aria-label', template.replace('[index]', String(i + 1)).replace('[length]', String(this.#positions)));
      return bar;
    });
    container.replaceChildren(...bars);
  }
}

/**
 * Counts down to the end of a sale.
 *
 * @typedef {Object} SaleCountdownRefs
 * @property {HTMLElement} days
 * @property {HTMLElement} hours
 * @property {HTMLElement} minutes
 * @property {HTMLElement} seconds
 *
 * @extends {Component<SaleCountdownRefs>}
 */
class SaleCountdown extends Component {
  requiredRefs = ['days', 'hours', 'minutes', 'seconds'];
  /** @type {number | undefined} */
  #timer;

  connectedCallback() {
    super.connectedCallback();
    this.#timer = window.setInterval(this.#update, 1000);
    this.#update();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    clearInterval(this.#timer);
  }

  #update = () => {
    const remaining = Math.max(0, Math.floor(Number(this.dataset.end) - Date.now() / 1000));

    this.refs.days.textContent = twoDigits(Math.floor(remaining / 86400));
    this.refs.hours.textContent = twoDigits(Math.floor((remaining % 86400) / 3600));
    this.refs.minutes.textContent = twoDigits(Math.floor((remaining % 3600) / 60));
    this.refs.seconds.textContent = twoDigits(remaining % 60);

    if (remaining === 0) this.#finish();
  };

  #finish() {
    clearInterval(this.#timer);
    this.hidden = true;

    const section = this.closest('.shopify-section');
    if (!(section instanceof HTMLElement)) return;

    section.querySelectorAll('[data-sale-ribbon-timed]').forEach((ribbon) => ribbon.remove());
    if (this.hasAttribute('data-hide-section')) section.hidden = true;
  }
}

if (!customElements.get('sale-carousel')) customElements.define('sale-carousel', SaleCarousel);
if (!customElements.get('sale-countdown')) customElements.define('sale-countdown', SaleCountdown);
