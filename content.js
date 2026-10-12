// content.js
document.addEventListener('dragstart', (e) => {
  const target = e.target;
  
  // Guard clause: Ensure target is a valid DOM Element node before querying
  if (!target || target.nodeType !== Node.ELEMENT_NODE) return;

  const img = target.tagName === 'IMG' ? target : target.querySelector('img');

  if (img) {
    const imgUrl = img.src || img.currentSrc;
    const pageUrl = window.location.href;

    // Send runtime message to sidepanel script
    chrome.runtime.sendMessage({
      type: 'SET_LAST_DRAGGED_URL',
      url: pageUrl,
      imgUrl: imgUrl
    });

    // Storage backup in case extension communication delays
    if (chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ 
        lastDraggedPageUrl: pageUrl,
        lastDraggedImgUrl: imgUrl 
      });
    }
  }
}, true);