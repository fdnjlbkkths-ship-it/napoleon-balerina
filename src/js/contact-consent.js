/** Разметка чекбокса согласия на обработку ПДн для форм обратной связи. */
export function renderContactConsentHtml() {
  return `
    <label class="form-consent">
      <input type="checkbox" name="pd-consent" value="1" required>
      <span>
        Я даю согласие на обработку персональных данных в соответствии с
        <a href="privacy.html" target="_blank" rel="noopener">политикой конфиденциальности</a>.
      </span>
    </label>`;
}

export function isContactConsentGiven(form) {
  const box = form?.querySelector('[name="pd-consent"]');
  return Boolean(box?.checked);
}
