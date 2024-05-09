import { addTempWrapper } from '../../scripts/decorate.js';
import {
  createTag,
  fetchPlaceholders,
  yieldToMain,
  getIconElement,
} from '../../scripts/utils.js';

import {
  formatDynamicCartLink,
  formatSalesPhoneNumber,
  shallSuppressOfferEyebrowText,
  fetchPlanOnePlans,
} from '../../scripts/utils/pricing.js';

const blockKeys = [
  'header',
  'borderParams',
  'explain',
  'mPricingRow',
  'mCtaGroup',
  'yPricingRow',
  'yCtaGroup',
  'featureList',
  'compare',
];
const SAVE_PERCENTAGE = '{{savePercentage}}';
const SALES_NUMBERS = '{{business-sales-numbers}}';
const PRICE_TOKEN = '{{pricing}}';
const YEAR_2_PRICING_TOKEN = '[[year-2-pricing-token]]';

function suppressOfferEyebrow(specialPromo, legacyVersion) {
  if (specialPromo.parentElement) {
    if (legacyVersion) {
      specialPromo.parentElement.classList.remove('special-promo');
      specialPromo.remove();
    } else {
      specialPromo.className = 'hide';
      specialPromo.parentElement.className = '';
      specialPromo.parentElement.classList.add('card-border');
      specialPromo.remove();
    }
  }
}

function getPriceElementSuffix(placeholders, placeholderArr, response) {
  return placeholderArr
    .map((phText) => {
      const key = phText.replace('{{', '').replace('}}', '');
      return key.includes('vat') && !response.showVat
        ? ''
        : placeholders[key] || '';
    })
    .join(' ');
}

function handleYear2PricingToken(pricingArea, y2p, priceSuffix) {
  try {
    const elements = pricingArea.querySelectorAll('p');
    const year2PricingToken = Array.from(elements).find(
      (p) => p.textContent.includes(YEAR_2_PRICING_TOKEN),
    );
    if (!year2PricingToken) return;
    if (y2p) {
      year2PricingToken.textContent = year2PricingToken.textContent.replace(
        YEAR_2_PRICING_TOKEN,
        `${y2p} ${priceSuffix}`,
      );
    } else {
      year2PricingToken.textContent = '';
    }
  } catch (e) {
    window.lana.log(e);
  }
}

function handleSpecialPromo(
  specialPromo,
  isPremiumCard,
  response,
  legacyVersion,
) {
  if (specialPromo?.textContent.includes(SAVE_PERCENTAGE)) {
    const offerTextContent = specialPromo.textContent;
    const shouldSuppress = shallSuppressOfferEyebrowText(
      response.savePer,
      offerTextContent,
      isPremiumCard,
      true,
      response.offerId,
    );

    if (shouldSuppress) {
      suppressOfferEyebrow(specialPromo, legacyVersion);
    } else {
      specialPromo.innerHTML = specialPromo.innerHTML.replace(
        SAVE_PERCENTAGE,
        response.savePer,
      );
    }
  }
  if (
    !isPremiumCard
    && specialPromo?.parentElement?.classList?.contains('special-promo')
  ) {
    specialPromo.parentElement.classList.remove('special-promo');
    if (specialPromo.parentElement.firstChild.innerHTML !== '') {
      specialPromo.parentElement.firstChild.remove();
    }
  }
}

function handleSavePercentage(savePercentElem, isPremiumCard, response) {
  if (savePercentElem) {
    const offerTextContent = savePercentElem.textContent;
    if (
      shallSuppressOfferEyebrowText(
        response.savePer,
        offerTextContent,
        isPremiumCard,
        true,
        response.offerId,
      )
    ) {
      savePercentElem.remove();
    } else {
      savePercentElem.innerHTML = savePercentElem.innerHTML.replace(
        SAVE_PERCENTAGE,
        response.savePer,
      );
    }
  }
}

function handlePriceSuffix(priceEl, priceSuffix, priceSuffixTextContent) {
  const parentP = priceEl.parentElement;
  if (parentP.children.length > 1) {
    Array.from(parentP.childNodes).forEach((node) => {
      if (node === priceEl) return;
      if (node.nodeName === '#text') {
        priceSuffix.append(node);
      } else {
        priceSuffix.before(node);
      }
    });
  } else {
    priceSuffix.textContent = priceSuffixTextContent;
  }
}

function handleRawPrice(price, basePrice, response) {
  price.innerHTML = response.formatted;
  basePrice.innerHTML = response.formattedBP || '';
  basePrice.innerHTML !== ''
    ? price.classList.add('price-active')
    : price.classList.remove('price-active');
}

function handleTooltip(pricingArea) {
  const elements = pricingArea.querySelectorAll('p');
  const pattern = /\[\[([^]+)\]\]([^]+)\[\[\/([^]+)\]\]/g;
  let tooltip;
  let tooltipDiv;

  Array.from(elements).forEach((p) => {
    const res = pattern.exec(p.textContent);
    if (res) {
      tooltip = res;
      tooltipDiv = p;
    }
  });
  if (!tooltip) return;
  tooltipDiv.textContent = tooltipDiv.textContent.replace(pattern, '');
  const tooltipText = tooltip[2];
  tooltipDiv.classList.add('tooltip');
  const span = createTag('div', { class: 'tooltip-text' });
  span.innerText = tooltipText;
  const icon = getIconElement('info', 44, 'Info', 'tooltip-icon');
  tooltipDiv.append(icon);
  tooltipDiv.append(span);
}
function handlePrice(placeholders, pricingArea, specialPromo, legacyVersion) {
  const priceEl = pricingArea.querySelector(`[title="${PRICE_TOKEN}"]`);
  const pricingBtnContainer = pricingArea.querySelector('.button-container');
  if (!pricingBtnContainer) return;
  if (!priceEl) return;

  const pricingSuffixTextElem = pricingBtnContainer.nextElementSibling;
  const placeholderArr = pricingSuffixTextElem.textContent?.split(' ');

  const priceRow = createTag('div', { class: 'pricing-row' });
  const price = createTag('span', { class: 'pricing-price' });
  const basePrice = createTag('span', { class: 'pricing-base-price' });
  const priceSuffix = createTag('div', { class: 'pricing-row-suf' });

  priceRow.append(basePrice, price, priceSuffix);

  fetchPlanOnePlans(priceEl?.href).then((response) => {
    const priceSuffixTextContent = getPriceElementSuffix(
      placeholders,
      placeholderArr,
      response,
    );
    const isPremiumCard = response.ooAvailable || false;
    const savePercentElem = pricingArea.querySelector('.card-offer');
    handleRawPrice(price, basePrice, response);
    handlePriceSuffix(priceEl, priceSuffix, priceSuffixTextContent);
    handleTooltip(pricingArea);
    handleSavePercentage(savePercentElem, isPremiumCard, response);
    handleSpecialPromo(specialPromo, isPremiumCard, response, legacyVersion);
    handleYear2PricingToken(pricingArea, response.y2p, priceSuffixTextContent);
  });

  priceEl?.parentNode?.remove();
  if (!priceRow) return;
  pricingArea.prepend(priceRow);
  pricingBtnContainer?.remove();
  pricingSuffixTextElem?.remove();
}

function createPricingSection(
  placeholders,
  pricingArea,
  ctaGroup,
  specialPromo,
  legacyVersion,
) {
  const pricingSection = createTag('div', { class: 'pricing-section' });
  pricingArea.classList.add('pricing-area');
  const offer = pricingArea.querySelector(':scope > p > em');
  if (offer) {
    offer.classList.add('card-offer');
  }
  handlePrice(placeholders, pricingArea, specialPromo, legacyVersion);
  ctaGroup.classList.add('card-cta-group');
  ctaGroup.querySelectorAll('a').forEach((a, i) => {
    a.classList.add('large');
    if (i === 1) a.classList.add('secondary');
    if (a.parentNode.tagName.toLowerCase() === 'strong') {
      a.classList.add('button', 'primary');
      a.parentNode.remove();
    }
    if (a.parentNode.tagName.toLowerCase() === 'p') {
      a.parentNode.remove();
    }
    formatDynamicCartLink(a);
    ctaGroup.append(a);
  });
  pricingSection.append(pricingArea);
  pricingSection.append(ctaGroup);
  return pricingSection;
}

function readBraces(inputString, card) {
  if (!inputString) {
    return null;
  }

  // Pattern to find {{...}}
  const pattern = /\{\{(.*?)\}\}/g;
  const matches = Array.from(inputString.trim().matchAll(pattern));

  if (matches.length > 0) {
    const [token, promoType] = matches[matches.length - 1];
    const specialPromo = createTag('div');
    specialPromo.textContent = inputString.split(token)[0].trim();
    card.classList.add(promoType.replaceAll(' ', ''));
    card.append(specialPromo);
    return specialPromo;
  }
  return null;
}
// Function for decorating a legacy header / promo.
function decorateLegacyHeader(header, card) {
  header.classList.add('card-header');
  const h2 = header.querySelector('h2');
  const h2Text = h2.textContent.trim();
  h2.innerHTML = '';
  const headerConfig = /\((.+)\)/.exec(h2Text);
  const premiumIcon = header.querySelector('img');
  let specialPromo;
  if (premiumIcon) h2.append(premiumIcon);
  if (headerConfig) {
    const cfg = headerConfig[1];
    h2.append(h2Text.replace(`(${cfg})`, '').trim());
    if (/^\d/.test(cfg)) {
      const headCntDiv = createTag('div', { class: 'head-cnt', alt: '' });
      headCntDiv.textContent = cfg;
      headCntDiv.prepend(
        createTag('img', {
          src: '/express/icons/head-count.svg',
          alt: 'icon-head-count',
        }),
      );
      header.append(headCntDiv);
    } else {
      specialPromo = createTag('div');
      specialPromo.textContent = cfg;
      card.classList.add('special-promo');
      card.append(specialPromo);
    }
  } else {
    h2.append(h2Text);
  }
  header.querySelectorAll('p').forEach((p) => {
    if (p.innerHTML.trim() === '') p.remove();
  });
  card.append(header);
  return { specialPromo, cardWrapper: card };
}

function decorateHeader(header, borderParams, card, cardBorder) {
  const h2 = header.querySelector('h2');
  // The raw text extracted from the word doc
  header.classList.add('card-header');
  const specialPromo = readBraces(borderParams?.innerText, cardBorder);
  const premiumIcon = header.querySelector('img');
  // Finds the headcount, removes it from the original string and creates an icon with the hc
  const extractHeadCountExp = /(>?)\(\d+(.*?)\)/;
  if (extractHeadCountExp.test(h2.innerText)) {
    const headCntDiv = createTag('div', { class: 'head-cnt', alt: '' });
    const headCount = h2.innerText
      .match(extractHeadCountExp)[0]
      .replace(')', '')
      .replace('(', '');
    [h2.innerText] = h2.innerText.split(extractHeadCountExp);
    headCntDiv.textContent = headCount;
    headCntDiv.prepend(
      createTag('img', {
        src: '/express/icons/head-count.svg',
        alt: 'icon-head-count',
      }),
    );
    header.append(headCntDiv);
  }
  if (premiumIcon) h2.append(premiumIcon);
  header.querySelectorAll('p').forEach((p) => {
    if (p.innerHTML.trim() === '') p.remove();
  });
  card.append(header);
  cardBorder.append(card);
  return { cardWrapper: cardBorder, specialPromo };
}

function decorateBasicTextSection(textElement, className, card) {
  if (textElement.innerHTML.trim()) {
    textElement.classList.add(className);
    card.append(textElement);
  }
}

// Links user to page where plans can be compared
function decorateCompareSection(compare, el, card) {
  if (compare?.innerHTML.trim()) {
    compare.classList.add('card-compare');
    compare.querySelector('a')?.classList.remove('button', 'accent');
    // in a tab, update url
    const closestTab = el.closest('div.tabpanel');
    if (closestTab) {
      try {
        const tabId = parseInt(closestTab.id.split('-').pop(), 10);
        const compareLink = compare.querySelector('a');
        const url = new URL(compareLink.href);
        url.searchParams.set('tab', tabId);
        compareLink.href = url.href;
      } catch (e) {
        // ignore
      }
    }
    card.append(compare);
  }
}

function createToggle(placeholders, pricingSections) {
  const subDesc = placeholders?.['subscription-type'] || 'Subscription Type:';
  const toggleWrapper = createTag('div', { class: 'billing-radio' });
  toggleWrapper.innerHTML = `<strong>${subDesc}</strong>`;
  const buttons = ['monthly', 'annual'].map((plan, i) => {
    const button = createTag('button', {
      class: i === 0 ? 'checked' : '',
    });
    button.innerHTML = `<span></span>${placeholders?.[plan] || ['Monthly', 'Annual'][i]}`;
    button.setAttribute('role', 'tab')
    button.addEventListener('click', () => {
      if (button.classList.contains('checked')) return;
      buttons.filter((b) => b !== button).forEach((b) => {
        b.classList.remove('checked');
      });
      button.classList.add('checked');
      pricingSections.forEach((section) => {
        if (section.classList.contains(plan)) {
          section.classList.remove('hide');
        } else {
          section.classList.add('hide');
        }
      });
    });
    return button;
  });
  toggleWrapper.append(...buttons);
  return toggleWrapper;
}

// In legacy versions, the card element encapsulates all content
// In new versions, the cardBorder element encapsulates all content instead
function decorateCard(
  {
    header,
    borderParams,
    explain,
    mPricingRow,
    mCtaGroup,
    yPricingRow,
    yCtaGroup,
    featureList,
    compare,
  },
  el,
  placeholders,
  legacyVersion,
) {
  const card = createTag('div', { class: 'card' });
  const cardBorder = createTag('div', { class: 'card-border' });

  const { specialPromo, cardWrapper } = legacyVersion
    ? decorateLegacyHeader(header, card)
    : decorateHeader(header, borderParams, card, cardBorder);

  decorateBasicTextSection(explain, 'card-explain', card);
  const mPricingSection = createPricingSection(
    placeholders,
    mPricingRow,
    mCtaGroup,
    specialPromo,
    legacyVersion,
  );
  mPricingSection.classList.add('monthly');
  const yPricingSection = createPricingSection(
    placeholders,
    yPricingRow,
    yCtaGroup,
    null,
  );
  yPricingSection.classList.add('annual', 'hide');
  const toggle = createToggle(placeholders, [mPricingSection, yPricingSection]);
  card.append(toggle, mPricingSection, yPricingSection);
  decorateBasicTextSection(featureList, 'card-feature-list', card);
  decorateCompareSection(compare, el, card);
  return cardWrapper;
}

// less thrashing by separating get and set
async function syncMinHeights(...groups) {
  const maxHeights = groups.map((els) => els.filter(
    (e) => !!e,
  ).reduce((max, e) => Math.max(max, e.offsetHeight), 0));
  await yieldToMain();
  maxHeights.forEach((maxHeight, i) => groups[i].forEach((e) => {
    if (e) e.style.minHeight = `${maxHeight}px`;
  }));
}

export default async function init(el) {
  addTempWrapper(el, 'pricing-cards');
  // For backwards compatability with old versions of the pricing card
  const legacyVersion = el.querySelectorAll(':scope > div').length < 10;
  const currentKeys = [...blockKeys];
  if (legacyVersion) {
    currentKeys.splice(1, 1);
  }
  const divs = currentKeys.map((_, index) => el.querySelectorAll(`:scope > div:nth-child(${index + 1}) > div`));

  const cards = Array.from(divs[0]).map((_, index) => currentKeys.reduce((obj, key, keyIndex) => {
    obj[key] = divs[keyIndex][index];
    return obj;
  }, {}));
  el.querySelectorAll(':scope > div:not(:last-of-type)').forEach((d) => d.remove());
  const cardsContainer = createTag('div', { class: 'cards-container' });
  const placeholders = await fetchPlaceholders();
  cards
    .map((card) => decorateCard(card, el, placeholders, legacyVersion))
    .forEach((card) => cardsContainer.append(card));

  const phoneNumberTags = [...cardsContainer.querySelectorAll('a')].filter(
    (a) => a.title.includes(SALES_NUMBERS),
  );
  if (phoneNumberTags.length > 0) {
    await formatSalesPhoneNumber(phoneNumberTags, SALES_NUMBERS);
  }
  el.classList.add('no-visible');
  el.prepend(cardsContainer);

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        observer.disconnect();
        syncMinHeights(
          cards.map(({ header }) => header),
          cards.map(({ explain }) => explain),
          cards.reduce((acc, card) => [...acc, card.mCtaGroup, card.yCtaGroup], []),
          [...el.querySelectorAll('.pricing-area')],
          cards.map(({ featureList }) => featureList.querySelector('p')),
          cards.map(({ featureList }) => featureList),
          cards.map(({ compare }) => compare),
        );
        el.classList.remove('no-visible');
      }
    });
  });
  observer.observe(el);
}
