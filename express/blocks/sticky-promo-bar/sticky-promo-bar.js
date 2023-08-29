/*
 * Copyright 2021 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

import {
  createTag,
// eslint-disable-next-line import/no-unresolved
} from '../../scripts/scripts.js';

import BlockMediator from '../../scripts/block-mediator.js';

function initScrollInteraction(block) {
  const spotHolder = createTag('div', { class: 'spot-holder' });
  block.insertAdjacentElement('afterend', spotHolder);

  const intersectionCallback = (entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting && spotHolder.getBoundingClientRect().top < 0) {
        block.classList.remove('loadinbody');
        spotHolder.classList.add('in-action');
        spotHolder.style.height = `${block.offsetHeight}px`;
        // make up for the page jumping
        window.scrollBy({ top: -86 });
      } else {
        block.classList.add('loadinbody');
        spotHolder.classList.remove('in-action');
        spotHolder.style.height = '0px';
      }
    });
  };

  const observer = new IntersectionObserver(intersectionCallback, {
    rootMargin: '0px',
    threshold: 1.0,
  });

  observer.observe(spotHolder);
}

export default function decorate(block) {
  const close = createTag('button', {
    class: 'close',
    'aria-label': 'close',
  });
  block.appendChild(close);

  BlockMediator.set('promobar', {
    block,
    rendered: true,
  });

  close.addEventListener('click', () => {
    block.remove();
    BlockMediator.set('promobar', {
      block,
      rendered: false,
    });
  });

  if (block.classList.contains('loadinbody')) {
    initScrollInteraction(block);
  }
}
