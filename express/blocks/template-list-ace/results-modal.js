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

import { createTag } from '../../scripts/scripts.js';
import {
  requestGeneration,
  postFeedback,
  monitorGeneration,
  MONITOR_STATUS,
  FEEDBACK_CATEGORIES,
} from './ace-api.js';
import useProgressManager from './progress-manager.js';
import BlockMediator from '../../scripts/block-mediator.js';

const NUM_PLACEHOLDERS = 4;
const MONITOR_INTERVAL = 2000;
const AVG_GENERATION_TIME = 12000;
const PROGRESS_ANIMATION_DURATION = 1000;
const PROGRESS_BAR_LINGER_DURATION = 500;

function getVoteHandler(id, category) {
  return async (e) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const { result: feedbackRes, error } = await postFeedback(
        id,
        category,
        'Rate this result: thumbs_down',
      );
      if (error) throw new Error(error);
      alert(feedbackRes);
    } catch (err) {
      console.error(err);
    }
  };
}

export function renderRateResult(result) {
  const wrapper = createTag('div', { class: 'feedback-rate' });
  wrapper.append('Rate this result');
  const downvoteLink = createTag('button', { class: 'feedback-rate-button' });
  const upvoteLink = createTag('button', { class: 'feedback-rate-button' });
  downvoteLink.append('👎');
  upvoteLink.append('👍');
  downvoteLink.addEventListener(
    'click',
    getVoteHandler(result.id, FEEDBACK_CATEGORIES.THUMBS_DOWN),
  );
  upvoteLink.addEventListener('click', getVoteHandler(result.id, FEEDBACK_CATEGORIES.THUMBS_UP));
  wrapper.append(downvoteLink);
  wrapper.append(upvoteLink);
  return wrapper;
}

// eslint-disable-next-line no-unused-vars
export function renderReportButton(result) {
  const wrapper = createTag('div', { class: 'feedback-report' });
  wrapper.append('Report');
  const reportButton = createTag('button', { class: 'feedback-report-button' });
  reportButton.append('🚩');
  wrapper.append(reportButton);
  wrapper.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    // TODO:
    console.log('report abuse form WIP');
  });
  return wrapper;
}

// FIXME: this is not really working yet
function getTemplateBranchUrl(result) {
  const { thumbnail } = result;
  return `https://prod-search.creativecloud.adobe.com/express?express=true&protocol=https&imageHref=${thumbnail}`;
}

function renderTemplate(result) {
  const { thumbnail } = result;
  const templateBranchUrl = getTemplateBranchUrl(result);
  const templateWrapper = createTag('div', { class: 'generated-template-wrapper' });
  templateWrapper.addEventListener('click', () => {
    window.location.href = templateBranchUrl;
  });
  const hoverContainer = createTag('div', { class: 'hover-container' });
  const feedbackRow = createTag('div', { class: 'feedback-row' });
  feedbackRow.append(renderRateResult(result));
  feedbackRow.append(renderReportButton(result));
  hoverContainer.append(feedbackRow);

  templateWrapper.append(createTag('img', { src: thumbnail, class: 'generated-template-image' }));
  templateWrapper.append(hoverContainer);
  return templateWrapper;
}

async function waitForGeneration(jobId) {
  const { fetchingState } = BlockMediator.get('ace-state');
  const { progressManager } = fetchingState;

  clearInterval(fetchingState.intervalId);
  return new Promise((resolve, reject) => {
    fetchingState.intervalId = setInterval(async () => {
      const res = await monitorGeneration(jobId);
      const { status, results, reason } = res;
      if (status === MONITOR_STATUS.IN_PROGRESS) {
        progressManager.update(Math.floor(results.length / NUM_PLACEHOLDERS) * 100);
      } else if (status === MONITOR_STATUS.COMPLETED) {
        progressManager.update(100);
        clearInterval(fetchingState.intervalId);
        setTimeout(() => {
          resolve(results);
        }, PROGRESS_ANIMATION_DURATION + PROGRESS_BAR_LINGER_DURATION);
      } else if (status === MONITOR_STATUS.FAILED || reason) {
        clearInterval(fetchingState.intervalId);
        reject(new Error(JSON.stringify({ status })));
      } else {
        clearInterval(fetchingState.intervalId);
        reject(new Error(JSON.stringify({ status, results, reason: 'unexpected status' })));
      }
      console.log('monitoring generation', fetchingState.intervalId);
    }, MONITOR_INTERVAL);
  });
}

export function renderLoader() {
  const wrapper = createTag('div', { class: 'loader-wrapper' });
  const textRow = createTag('div', { class: 'loader-text-row' });
  const text = createTag('span', { class: 'loader-text' });
  text.textContent = 'Loading results…';
  const percentage = createTag('span', { class: 'loader-percentage' });
  percentage.textContent = '0%';
  textRow.append(text);
  textRow.append(percentage);
  wrapper.append(textRow);

  const progressBar = createTag('div', { class: 'loader-progress-bar' });
  progressBar.append(createTag('div'));
  wrapper.append(progressBar);

  const placeholderRow = createTag('div', { class: 'loader-placeholder-row' });
  for (let i = 0; i < NUM_PLACEHOLDERS; i += 1) {
    placeholderRow.append(createTag('div', { class: 'loader-placeholder' }));
  }
  wrapper.append(placeholderRow);

  const { modalContent } = BlockMediator.get('ace-state');
  modalContent.append(wrapper);
}

function updateProgressBar(percentage) {
  const percentageEl = document.querySelector('.loader-percentage');
  const progressBar = document.querySelector('.loader-progress-bar div');
  if (!percentageEl || !progressBar) return;
  percentageEl.textContent = `${percentage}%`;
  progressBar.style.width = `${percentage}%`;
}

export async function fetchResults({ repeat = false } = {}) {
  const {
    query,
    dropdownValue,
    fetchingState,
    placeholders,
  } = BlockMediator.get('ace-state');
  if (!fetchingState.progressManager) {
    fetchingState.progressManager = useProgressManager(
      updateProgressBar,
      PROGRESS_ANIMATION_DURATION,
      {
        avgCallingTimes: AVG_GENERATION_TIME / MONITOR_INTERVAL,
        sample: 3,
      },
    );
  }
  const oldLoader = document.querySelector('.loader-wrapper');
  if (oldLoader) {
    fetchingState.progressManager.reset();
    oldLoader.style.display = 'block';
  } else {
    renderLoader();
  }
  const oldResults = document.querySelector('.generated-results-wrapper');
  if (oldResults) {
    oldResults.remove();
  }

  const requestConfig = {
    query,
    num_results: NUM_PLACEHOLDERS,
    locale: 'en-us',
    category: 'poster',
    subcategory: (
      dropdownValue
        && dropdownValue !== placeholders['template-list-ace-categories-dropdown']?.split(',')?.[0]
    ) || null,
    force: false,
    fetchExisting: true,
  };
  if (repeat) {
    requestConfig.force = true;
    requestConfig.fetchExisting = false;
  }
  const { jobId, status } = await requestGeneration(requestConfig);
  if (!['in-progress', 'completed'].includes(status)) {
    throw new Error(`Error requesting generation: ${jobId} ${status}`);
  }

  // consider the first 6-12% as the time for triggering generation
  fetchingState.progressManager.update(Math.random() * 6 + 6);

  return waitForGeneration(jobId);
}

export async function renderResults(results) {
  const { modalContent } = BlockMediator.get('ace-state');

  const oldLoader = document.querySelector('.loader-wrapper');
  if (oldLoader) {
    oldLoader.style.display = 'none';
  }

  const generatedResultsWrapper = createTag('div', { class: 'generated-results-wrapper' });

  const generatedTitle = createTag('div', { class: 'generated-title' });
  generatedTitle.textContent = 'Here\'s results';
  const generatedRow = createTag('div', { class: 'generated-row' });
  results
    .filter((result) => result.generated)
    .map((result) => renderTemplate(result))
    .forEach((image) => {
      generatedRow.append(image);
    });
  generatedResultsWrapper.append(generatedTitle);
  generatedResultsWrapper.append(generatedRow);
  modalContent.append(generatedResultsWrapper);
}

function createModalSearch() {
  const aceState = BlockMediator.get('ace-state');
  const { placeholders, query } = aceState;
  const searchForm = createTag('form', { class: 'search-form' });
  const searchBar = createTag('input', {
    class: 'search-bar',
    type: 'text',
    placeholder: placeholders['template-list-ace-search-hint'] ?? 'Describe what you want to generate...',
    enterKeyHint: placeholders.search ?? 'Search',
  });
  searchBar.value = query;
  searchForm.append(searchBar);

  const button = createTag('button', { class: 'search-button', title: placeholders['template-list-ace-button-refresh'] ?? 'Refresh results' });
  button.textContent = placeholders['template-list-ace-button-refresh'] ?? 'Refresh results';
  let repeat = false;
  button.addEventListener('click', async (e) => {
    e.preventDefault();
    if (!searchBar.value) {
      alert('search should not be empty!');
      return;
    }
    if (searchBar.value === aceState.query) {
      repeat = true;
    } else {
      repeat = false;
    }
    aceState.query = searchBar.value;
    button.disabled = true;
    try {
      const results = await fetchResults({ repeat });
      await renderResults(results);
    } catch (err) {
      console.error(err);
    }

    button.disabled = false;
  });
  searchForm.append(button);
  return searchForm;
}

function createModalDropdown() {
  const { placeholders, dropdownValue } = BlockMediator.get('ace-state');
  const dropdownText = placeholders['template-list-ace-title'];
  const dropdown = createTag('h1', { class: 'modal-dropdown' });
  const texts = dropdownText.split('{{breakline}}')[0].trim().split('{{ace-dropdown}}');
  dropdown.append(texts[0].trim());
  const categorySpan = createTag('span', { class: 'modal-dropdown-category' });
  categorySpan.append(dropdownValue);
  dropdown.append(categorySpan);
  dropdown.append(texts[1].trim());
  return dropdown;
}

function renderTitleRow() {
  const { placeholders } = BlockMediator.get('ace-state');
  const titleRow = createTag('div', { class: 'modal-title-row' });
  const dropdown = createModalDropdown();
  const scratchWrapper = createTag('div', { class: 'scratch-wrapper' });
  const noGuidanceSpan = createTag('span', { class: 'no-guidance' });
  noGuidanceSpan.textContent = placeholders['template-list-ace-no-guidance'] ?? 'Don\'t need guidance?';
  const fromScratchButton = createTag('button', { class: 'from-scratch-button' });
  fromScratchButton.textContent = placeholders['template-list-ace-from-scratch'] ?? 'Create from scratch';
  scratchWrapper.append(noGuidanceSpan);
  scratchWrapper.append(fromScratchButton);
  titleRow.append(dropdown);
  titleRow.append(scratchWrapper);
  return titleRow;
}

export function renderModalContent() {
  const { modalContent } = BlockMediator.get('ace-state');
  modalContent.append(renderTitleRow());
  modalContent.append(createModalSearch());
}
