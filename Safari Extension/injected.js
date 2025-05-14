class Client {
  constructor(doc, window) {
    this.doc = doc;
    this.window = window;
    this.clientX         = 0;
    this.clientY         = 0;
    this.popupTagId      = "safarikai-popup";
    this.enabled         = true;
    this.mouseDown       = false;
    this.highlighted     = false;
    this.highlightText   = true;
    this.showRomaji      = true;
    this.showTranslation = true;
    this.lookupOnlyOnHotkey = false;
    this.lookupImgAlt  = false;
    this.rangeOffset   = 0;
    this.altPressed    = false;

    // Mapping for pinyin tone conversion
    this.pinyinVowels = {
      'a': ['ā', 'á', 'ǎ', 'à', 'a'],
      'e': ['ē', 'é', 'ě', 'è', 'e'],
      'i': ['ī', 'í', 'ǐ', 'ì', 'i'],
      'o': ['ō', 'ó', 'ǒ', 'ò', 'o'],
      'u': ['ū', 'ú', 'ǔ', 'ù', 'u'],
      'ü': ['ǖ', 'ǘ', 'ǚ', 'ǜ', 'ü'],
      'v': ['ǖ', 'ǘ', 'ǚ', 'ǜ', 'ü']  // v is sometimes used instead of ü
    };

    this.doc.onmousemove = e => {
      if (!this.enabled || this.mouseDown) {
        this.hidePopup();
      } else {
        let shouldLookup = true;
        if (this.lookupOnlyOnHotkey) {
          shouldLookup = this.altPressed;
        }
        this.createRange(e);
        if (shouldLookup && (this.selectionText != null ? this.selectionText.length : undefined) > 0) {
          safari.extension.dispatchMessage("lookupWord", {word: this.selectionText, url: this.window.location.href});
        } else {
          this.clearHighlight();
          this.hidePopup();
        }
      }
      return true;
    };

    this.doc.onmouseout  = e => this.hidePopup();
    this.doc.onmousedown = e => {
      if (e.button === 0) {
        this.mouseDown = true;
        this.clearHighlight();
      }
      return true;
    };
    this.doc.onmouseup   = e => {
      if (e.button === 0) {
        this.mouseDown = false;
      }
      return true;
    };

    this.doc.onkeydown = event => {
      if (event.key === "Alt") {
        this.altPressed = true;
      }
    };
    this.doc.onkeyup = event => {
      this.altPressed = false;
    };

    safari.self.addEventListener("message", e => {
      const messageData = e.message;

      switch (e.name) {
        case "showResult": return this.showResult(messageData.word, messageData.url, messageData.result);
        case "status": return this.updateStatus(messageData);
      }
    });

    // Ask status on load
    safari.extension.dispatchMessage("queryStatus");
  }

  createRange(e) {
    this.clientX = e.clientX;
    this.clientY = e.clientY;
    const ele = this.doc.elementFromPoint(this.clientX, this.clientY);
    this.range = null;
    if (["TEXTAREA", "INPUT"].includes(ele.tagName)) {
      return this.selectionText = "";
    } else if (this.lookupImgAlt && ele.tagName === "IMG") {
       return this.selectionText = ele.alt.trim();
    } else if (this.getParents(ele, "[contenteditable]").length) {
      return this.selectionText = "";
    } else {
      const range = this.doc.caretRangeFromPoint(this.clientX, this.clientY);
      if (!range) { return; }

      let container = range.startContainer;
      let offset = range.startOffset;

      if (offset === (container.data != null ? container.data.length : undefined)) {
        if (this.isInlineNode(e.target) && (container.parentNode.innerText !== e.target.innerText)) {
          container = e.target.firstChild;
          offset = 0;
        }
      }

      range.setStart(container, offset);
      range.setEnd(container, Math.min(container.data != null ? container.data.length : undefined, offset + 20));

      const text = range.toString();
      this.range = range;
      this.rangeOffset = offset;
      this.selectionText = text;
    }
  }

  highlight(word) {
    if (!this.highlightText || !this.range) { return; }
    if (this.mouseDown) { return; }
    const sel = this.doc.defaultView.getSelection();
    if (!this.highlighted && (sel.toString().length > 0)) { return; } // user selection
    sel.removeAllRanges();
    if (this.range) {
      const container = this.range.startContainer;
      this.range.setEnd(container, Math.min(container.data != null ? container.data.length : undefined, this.rangeOffset + word.length));
      sel.addRange(this.range);
    }
    return this.highlighted = true;
  }

  clearHighlight() {
    if (!this.highlightText) { return; }
    if (this.highlighted) {
      const sel = this.doc.defaultView.getSelection();
      sel.removeAllRanges();
      return this.highlighted = false;
    }
  }

  getPopup() { return this.doc.getElementById(this.popupTagId); }

  injectPopup() {
    if (this.getPopup()) { return; }

    const popup = this.doc.createElement("div");
    popup.id = this.popupTagId;
    return this.doc.body.appendChild(popup);
  }

  hidePopup() { return __guard__(this.getPopup(), x => x.style.display = "none"); }

  // Helper function to apply a tone mark to a vowel at a specific index
  applyToneToVowelAtIndex(text, vowel, index, tone) {
    const tonedVowel = this.pinyinVowels[vowel][tone];
    return text.substring(0, index) + tonedVowel + text.substring(index + 1);
  }

  // Convert pinyin with tone numbers (e.g., "yi1") to pinyin with diacritics (e.g., "yī")
  convertPinyinToDiacritics(pinyin) {
    if (!pinyin) return '';

    // Split the input by spaces to handle multiple syllables
    return pinyin.split(' ').map(syllable => {
      // Replace "u:" with "ü" before processing
      syllable = syllable.replace(/u:/g, 'ü');

      // Extract the tone number (if any)
      const toneMatch = syllable.match(/([a-zA-ZüÜ]+)([1-5])?/);
      if (!toneMatch) return syllable;

      const [, syllableWithoutTone, toneNumber] = toneMatch;
      const tone = parseInt(toneNumber || '5') - 1; // Default to neutral tone (5)

      // Special cases for vowel combinations
      // For 'a', 'e', 'o' combinations, the tone goes on the first vowel
      if (syllableWithoutTone.includes('ai')) {
        return this.applyToneToVowelAtIndex(syllableWithoutTone, 'a', syllableWithoutTone.indexOf('a'), tone);
      }
      if (syllableWithoutTone.includes('ei')) {
        return this.applyToneToVowelAtIndex(syllableWithoutTone, 'e', syllableWithoutTone.indexOf('e'), tone);
      }
      if (syllableWithoutTone.includes('ao')) {
        return this.applyToneToVowelAtIndex(syllableWithoutTone, 'a', syllableWithoutTone.indexOf('a'), tone);
      }
      if (syllableWithoutTone.includes('ou')) {
        return this.applyToneToVowelAtIndex(syllableWithoutTone, 'o', syllableWithoutTone.indexOf('o'), tone);
      }

      // For 'iu', 'ie', 'ui', the tone goes on the second vowel
      if (syllableWithoutTone.includes('iu')) {
        return this.applyToneToVowelAtIndex(syllableWithoutTone, 'u', syllableWithoutTone.indexOf('u'), tone);
      }
      if (syllableWithoutTone.includes('ie')) {
        return this.applyToneToVowelAtIndex(syllableWithoutTone, 'e', syllableWithoutTone.indexOf('e'), tone);
      }
      if (syllableWithoutTone.includes('ui')) {
        return this.applyToneToVowelAtIndex(syllableWithoutTone, 'i', syllableWithoutTone.indexOf('i'), tone);
      }

      // Find the vowel to modify with the tone mark
      // Priority: a, o, e, i, u, ü
      const vowelPriority = ['a', 'o', 'e', 'i', 'u', 'ü', 'v'];
      let vowelToModify = '';
      let vowelIndex = -1;

      for (const vowel of vowelPriority) {
        const index = syllableWithoutTone.indexOf(vowel);
        if (index !== -1) {
          vowelToModify = vowel;
          vowelIndex = index;
          break;
        }
      }

      // If no vowel found, return the original syllable
      if (vowelIndex === -1) return syllable;

      // Replace the vowel with its tone variant
      return this.applyToneToVowelAtIndex(syllableWithoutTone, vowelToModify, vowelIndex, tone);
    }).join(' ');
  }

  decorateRow(row) {
    return `\
<li>
  <div class='kana'>${ this.convertPinyinToDiacritics(row.pinyin) }</div>
  ${ row.hanzi.length > 0 ? `<div class='kanji'>${row.hanzi}</div>` : "" }
  ${ this.showTranslation ? "<div class='translation'>" : "" }
    ${ this.showTranslation ? `${row.translation}` : "" }
  ${ this.showTranslation ? "</div>" : "" }
</li>\
`;
  }

  showResult(word, url, result) {
    if (this.window.location.href !== url) { return; }
    if (window.top !== window) { return; }
    this.injectPopup();
    const popup = this.getPopup();
    popup.style.display = "block";
    if (result.length === 0) {
      this.clearHighlight();
      return this.hidePopup();
    } else {
      this.highlight(word);
      const htmlRows = (Array.from(result).map((row) => this.decorateRow(row)));
      popup.innerHTML = `<ul class='results'>${ htmlRows.join('') }</ul>`;
      popup.style.maxWidth = this.window.innerWidth < 400 ? "80%" : "500px";

      let left = this.clientX + this.window.scrollX;
      const overflowX = ((this.clientX + popup.offsetWidth) - this.window.innerWidth) + 10;
      if (overflowX > 0) { left -= overflowX; }
      popup.style.left = left + "px";

      const margin = 30;
      let top = this.clientY + this.window.scrollY + margin;
      if (this.clientY > (this.window.innerHeight / 2)) { top = (this.clientY + this.window.scrollY) - popup.offsetHeight - margin; }
      return popup.style.top = top + "px";
    }
  }

  updateStatus(status) {
    this.enabled         = status.enabled;
    this.highlightText   = status.highlightText;
    this.showTranslation = status.showTranslation;
    this.lookupOnlyOnHotkey = status.lookupOnlyOnHotkey;
    this.lookupImgAlt = status.lookupImgAlt;
    if (!this.enabled) { return this.hidePopup(); }
  }

  isInlineNode(node) {
    if (node.nodeName === "#text") { return true; }
    const display = this.doc.defaultView.getComputedStyle(node, null).getPropertyValue("display");
    return (display === "inline") || (display === "inline-block");
  }

  /**
   * Get all of an element's parent elements up the DOM tree
   * @param  {Node}   elem     The element
   * @param  {String} selector Selector to match against [optional]
   * @return {Array}           The parent elements
   */
  getParents( elem, selector ) {
    var parents = [];
    for ( ; elem && elem !== document; elem = elem.parentNode ) {
      if ( selector ) {
        if ( elem.matches( selector ) ) {
          parents.push( elem );
        }
      } else {
        parents.push( elem );
      }
    }
    return parents;
  };
}

const client = new Client(document, window);

function __guard__(value, transform) {
  return (typeof value !== 'undefined' && value !== null) ? transform(value) : undefined;
}
