/*
 * Copyright 2023 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

/* eslint-disable import/named, import/extensions */

import { createOptimizedPicture, createTag, fetchPlaceholders } from '../../scripts/scripts.js';

function isDarkOverlayReadable(colorString) {
  let r;
  let g;
  let b;

  if (colorString.match(/^rgb/)) {
    const colorValues = colorString.match(
      /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*(\d+(?:\.\d+)?))?\)$/,
    );
    [r, g, b] = colorValues.slice(1);
  } else {
    const hexToRgb = +`0x${colorString
      .slice(1)
      .replace(colorString.length < 5 ? /./g : '', '$&$&')}`;
    // eslint-disable-next-line no-bitwise
    r = (hexToRgb >> 16) & 255;
    // eslint-disable-next-line no-bitwise
    g = (hexToRgb >> 8) & 255;
    // eslint-disable-next-line no-bitwise
    b = hexToRgb & 255;
  }

  const hsp = Math.sqrt(0.299 * (r * r) + 0.587 * (g * g) + 0.114 * (b * b));
  return hsp > 140;
}

function reset(block, payload) {
  const howToWindow = block.ownerDocument.defaultView;

  howToWindow.clearInterval(payload.rotationInterval);
  payload.rotationInterval = null;

  const picture = block.querySelector('picture');

  if (picture) {
    delete picture.style.height;
  }

  block.classList.remove('no-cover');
  payload.fixedImageSize = false;
}

const loadImage = (img) => new Promise((resolve) => {
  if (img.complete && img.naturalHeight !== 0) resolve();
  else {
    img.onload = () => {
      resolve();
    };
  }
});

function setPictureHeight(block, payload, override) {
  if (!payload.fixedImageSize || override) {
    // trick to fix the image height when vw > 900 and avoid image resize when toggling the tips
    const container = block.parentElement.parentElement;
    const picture = container.querySelector('picture');

    if (picture) {
      const img = picture.querySelector('img');
      const panelHeight = block.parentElement.offsetHeight;
      const imgHeight = img.naturalHeight;
      picture.style.height = `${panelHeight || imgHeight}px`;
      payload.fixedImageSize = true;
    }
  }
}

function activate(block, payload, target) {
  setPictureHeight(block, payload);
  // de-activate all
  block.querySelectorAll('.tip, .tip-number').forEach((item) => {
    item.classList.remove('active');
  });

  // get index of the target
  const i = parseInt(target.getAttribute('data-tip-index'), 10);
  // activate corresponding number and tip
  block.querySelectorAll(`.tip-${i}`).forEach((elem) => elem.classList.add('active'));
}

function initRotation(payload) {
  if (payload.howToWindow && !payload.rotationInterval) {
    payload.rotationInterval = payload.howToWindow.setInterval(() => {
      payload.howToDocument.querySelectorAll('.tip-numbers').forEach((numbers) => {
        // find next adjacent sibling of the currently activated tip
        let activeAdjacentSibling = numbers.querySelector('.tip-number.active+.tip-number');
        if (!activeAdjacentSibling) {
          // if no next adjacent, back to first
          activeAdjacentSibling = numbers.firstElementChild;
        }
        activate(numbers.parentElement, payload, activeAdjacentSibling);
      });
    }, 5000);
  }
}

function buildStepsHowToCarousel(block, payload) {
  const carouselDivs = block.querySelector('.content-wrapper');
  const rows = Array.from(carouselDivs.children);
  const carousel = createTag('div', { class: 'carousel-wrapper' });

  const includeSchema = block.classList.contains('schema');

  const numbers = createTag('div', { class: 'tip-numbers', 'aria-role': 'tablist' });
  carousel.prepend(numbers);
  const tips = createTag('div', { class: 'tips' });
  carousel.append(tips);
  carouselDivs.append(payload.icon, payload.heading, carousel, payload.cta);

  if (includeSchema) {
    const schemaObj = {
      '@context': 'http://schema.org',
      '@type': 'HowTo',
      name: (payload.heading) || payload.howToDocument.title,
      step: [],
    };

    const schema = createTag('script', { type: 'application/ld+json' });
    schema.innerHTML = JSON.stringify(schemaObj);
    const { head } = payload.howToDocument;
    head.append(schema);

    rows.forEach((row, i) => {
      const cells = Array.from(row.children);
      const h3 = createTag('h3');
      h3.innerHTML = cells[0].textContent.trim();
      const text = createTag('div', { class: 'tip-text' });
      text.append(h3);

      schemaObj.step.push({
        '@type': 'HowToStep',
        position: i + 1,
        name: h3.textContent.trim(),
        itemListElement: {
          '@type': 'HowToDirection',
          text: text.textContent.trim(),
        },
      });
    });
  }

  rows.forEach((row, i) => {
    row.classList.add('tip');
    row.classList.add(`tip-${i + 1}`);
    row.setAttribute('data-tip-index', i + 1);

    const cells = Array.from(row.children);

    const h3 = createTag('h3');
    h3.innerHTML = cells[0].textContent.trim();
    const text = createTag('div', { class: 'tip-text' });
    text.append(h3);
    text.append(cells[1]);

    row.innerHTML = '';
    row.append(text);

    tips.prepend(row);

    const number = createTag('div', {
      class: `tip-number tip-${i + 1}`,
      tabindex: '0',
      title: `${i + 1}`,
      'aria-role': 'tab',
    });

    number.innerHTML = `<span>${i + 1}</span>`;
    number.setAttribute('data-tip-index', i + 1);

    number.addEventListener('click', (e) => {
      if (payload.rotationInterval) {
        payload.howToWindow.clearTimeout(payload.rotationInterval);
      }

      let { target } = e;
      if (e.target.nodeName.toLowerCase() === 'span') {
        target = e.target.parentElement;
      }
      activate(block, payload, target);
    });

    number.addEventListener('keyup', (e) => {
      if (e.which === 13) {
        e.preventDefault();
        e.target.click();
      }
    });

    numbers.append(number);

    if (i === 0) {
      row.classList.add('active');
      number.classList.add('active');
    }
  });

  if (payload.hotToWindow) {
    payload.hotToWindow.addEventListener('resize', () => {
      reset(block);
      activate(block, payload, block.querySelector('.tip-number.tip-1'));
      initRotation(payload);
    });

    // slgiht delay to allow panel to size correctly
    payload.hotToWindow.setTimeout(() => {
      activate(block, payload, block.querySelector('.tip-number.tip-1'));
      initRotation(payload);
    }, 100);
  }
}

function roundedImage(x, y, width, height, radius, ctx) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function layerTemplateImage(canvas, ctx, templateImg) {
  templateImg.style.objectFit = 'contain';

  return new Promise((outerResolve) => {
    let prevWidth;
    const drawImage = (centerX, centerY, maxWidth, maxHeight) => new Promise((resolve) => {
      const obs = new ResizeObserver((changes) => {
        for (const change of changes) {
          if (change.contentRect.width === prevWidth) return;
          prevWidth = change.contentRect.width;
          if (prevWidth <= maxWidth && change.contentRect.height <= maxHeight) {
            ctx.save();
            roundedImage(centerX - (templateImg.width / 2), centerY - (templateImg.height / 2),
              templateImg.width, templateImg.height, 7, ctx);
            ctx.clip();
            ctx.drawImage(templateImg, 0, 0, templateImg.naturalWidth,
              templateImg.naturalHeight, centerX - (templateImg.width / 2),
              centerY - (templateImg.height / 2), templateImg.width, templateImg.height);
            ctx.restore();
            obs.disconnect();
            resolve();
          }
        }
      });
      obs.observe(templateImg);
      templateImg.style.maxWidth = `${maxWidth}px`;
      templateImg.style.maxHeight = `${maxHeight}px`;
    });

    // start and end areas were directly measured and transferred from the spec image
    drawImage(1123, 600, 986, 652)
      .then(() => drawImage(1816, 479, 312, 472))
      .then(() => outerResolve());
  });
}

function getColorSVG(svgName) {
  const symbols = ['hero-marquee', 'hero-marquee-localized', 'hands-and-heart', 'color-how-to-graph'];

  if (symbols.includes(svgName)) {
    return `<svg xmlns="http://www.w3.org/2000/svg" class="${svgName}">
      ${svgName ? `<title>${svgName}</title>` : ''}
      <use href="/express/icons/color-sprite.svg#${svgName}"></use>
    </svg>`;
  }

  return null;
}

export default async function decorate(block) {
  const payload = {
    rotationInterva: null,
    fixedImageSize: false,
    howToDocument: block.ownerDocument,
    howToWindow: block.ownerDocument.defaultView,
  };

  const colorPageUseCase = block.classList.contains('color');
  const rows = Array.from(block.children);

  if (colorPageUseCase) {
    const colorDataDiv = rows.shift();
    const contextRow = colorDataDiv.querySelector('div');
    const colorCarouselDiv = createTag('div', { class: 'content-wrapper' });

    if (contextRow) {
      const colorDataRows = contextRow.children;

      if (colorDataRows.length === 6) {
        payload.icon = colorDataRows[0].querySelector('svg');
        [, payload.heading] = colorDataRows;
        payload.colorName = colorDataRows[2].textContent.trim();
        [payload.primaryHex, payload.secondaryHex] = colorDataRows[3].textContent.split(',');
        payload.colorGraphName = colorDataRows[4].textContent.trim();
        payload.cta = colorDataRows[5].querySelector('a');
        const imgWrapper = createTag('div', { class: 'img-wrapper' });
        imgWrapper.innerHTML = getColorSVG(payload.colorGraphName);

        const colorTextOverlay = createTag('div', { class: 'color-graph-text-overlay' });
        const colorName = createTag('p', { class: 'color-name' });
        const colorHex = createTag('p', { class: 'color-hex' });
        colorName.textContent = payload.colorName;
        colorHex.textContent = payload.primaryHex;

        colorTextOverlay.append(colorName, colorHex);
        imgWrapper.prepend(colorTextOverlay);
        block.prepend(imgWrapper);
        colorDataDiv.remove();
      }

      rows.forEach((step) => {
        colorCarouselDiv.append(step);
      });

      block.append(colorCarouselDiv);
    }
  }

  buildStepsHowToCarousel(block, payload);

  if (colorPageUseCase) {
    block.querySelectorAll(':scope > div')?.forEach((div) => {
      div.style.backgroundColor = payload.primaryHex;
      div.style.color = payload.secondaryHex;
    });

    block.querySelectorAll('svg')?.forEach((svg) => {
      svg.style.fill = payload.secondaryHex;
    });

    if (!isDarkOverlayReadable(payload.primaryHex)) {
      block.classList.add('dark');
    }
  }
}
