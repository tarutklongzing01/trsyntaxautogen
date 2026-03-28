export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

export function toggleHidden(element, hidden) {
  if (!element) {
    return;
  }

  element.classList.toggle('hidden', hidden);
}

export function clearForm(form) {
  form?.reset();
}

export function setDisabled(elements, disabled) {
  elements.forEach((element) => {
    if (element) {
      element.disabled = disabled;
    }
  });
}

