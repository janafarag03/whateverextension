/* eslint-env browser, webextensions */
// sidepanel.js

window.topZIndex = window.topZIndex || 10;
let lastDraggedPageUrl = null;

if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'SET_LAST_DRAGGED_URL') {
      lastDraggedPageUrl = message.url;
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const journalBackdrops = [
    { name: 'CRUMPLED GRID', class: 'bg-crumpled-grid' },
    { name: 'DOTTED JOURNAL', class: 'bg-dotted-paper' },
    { name: 'FOLDED SHEET', class: 'bg-folded-paper' },
    { name: 'LOG SHEET', class: 'bg-engineering' },
    { name: 'DOODLE GRID', class: 'bg-kitty-grid' },
    { name: 'LACE LINED', class: 'bg-lace-lined' },
    { name: 'FOIL EMBOSSED', class: 'bg-foil-embossed' }
  ];

  let activeBgIndex = 0;

  const cycleBgBtn = document.getElementById('cycle-bg-btn');
  const bgNameDisplay = document.getElementById('bg-name-display');
  const dropZone = document.getElementById('drop-zone');
  const clearBtn = document.getElementById('btn-clear-board');
  const saveBtn = document.getElementById('btn-save-canvas');
  const inventoryTray = document.getElementById('inventory-tray');

  function applyBackdrop(index) {
    if (!dropZone) return;
    const selected = journalBackdrops[index];
    if (!selected) return;

    journalBackdrops.forEach(item => {
      if (item && item.class) dropZone.classList.remove(item.class);
    });

    dropZone.classList.add(selected.class);
    if (bgNameDisplay) bgNameDisplay.textContent = selected.name;

    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ savedBgIndex: index });
    }
  }

  if (cycleBgBtn) {
    cycleBgBtn.addEventListener('click', () => {
      activeBgIndex = (activeBgIndex + 1) % journalBackdrops.length;
      applyBackdrop(activeBgIndex);
    });
  }

  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(['savedBgIndex'], (result) => {
      if (result.savedBgIndex !== undefined && result.savedBgIndex >= 0 && result.savedBgIndex < journalBackdrops.length) {
        activeBgIndex = result.savedBgIndex;
      }
      applyBackdrop(activeBgIndex);
    });
  } else {
    applyBackdrop(activeBgIndex);
  }

  loadRackFromStorage();

  if (dropZone) {
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
      dropZone.addEventListener(eventName, e => e.preventDefault(), false);
      document.body.addEventListener(eventName, e => e.preventDefault(), false);
    });

    ['dragenter', 'dragover'].forEach(eventName => {
      dropZone.addEventListener(eventName, () => dropZone.classList.add('highlight'), false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
      dropZone.addEventListener(eventName, () => dropZone.classList.remove('highlight'), false);
    });

    dropZone.addEventListener('drop', handleDrop, false);

    dropZone.addEventListener('pointerdown', (e) => {
      if (e.target.id === 'drop-zone' || e.target.classList.contains('base-silhouette')) {
        document.querySelectorAll('.garment-card').forEach(el => el.classList.remove('is-selected'));
      }
    });
  }

  async function handleDrop(e) {
    e.preventDefault();
    const dt = e.dataTransfer;

    let imageUrl = dt.getData('text/plain') || dt.getData('text/uri-list');

    if (!imageUrl) {
      const htmlData = dt.getData('text/html');
      if (htmlData) {
        const match = htmlData.match(/src=["']([^"']+)["']/i);
        if (match && match[1]) {
          imageUrl = match[1];
        }
      }
    }

    let productPageUrl = lastDraggedPageUrl;

    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      const storageData = await new Promise(resolve => {
        chrome.storage.local.get(['lastDraggedPageUrl', 'lastDraggedImgUrl'], resolve);
      });
      if (!productPageUrl) productPageUrl = storageData.lastDraggedPageUrl;
      if (!imageUrl && storageData.lastDraggedImgUrl) imageUrl = storageData.lastDraggedImgUrl;
    }

    if (!productPageUrl && typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.query) {
      const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (activeTab && activeTab.url && !activeTab.url.startsWith('chrome://')) {
        productPageUrl = activeTab.url;
      }
    }

    lastDraggedPageUrl = null;
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.remove(['lastDraggedPageUrl', 'lastDraggedImgUrl']);
    }

    if (imageUrl) {
      fetchAndCutoutImage(imageUrl, productPageUrl);
    } else if (dt.files && dt.files.length > 0) {
      Array.from(dt.files).forEach(file => {
        if (file.type.startsWith('image/')) {
          const reader = new FileReader();
          reader.onload = (event) => cutoutWhiteBackground(event.target.result, null);
          reader.readAsDataURL(file);
        }
      });
    }
  }

  document.addEventListener('paste', (e) => {
    const items = e.clipboardData && e.clipboardData.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile();
        const reader = new FileReader();
        reader.onload = (event) => setBaseSilhouette(event.target.result);
        reader.readAsDataURL(file);
        break;
      }
    }
  });

  if (saveBtn) saveBtn.addEventListener('click', saveCanvasImage);

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (!dropZone) return;
      const cards = dropZone.querySelectorAll('.garment-card');
      cards.forEach(card => card.remove());

      const base = dropZone.querySelector('.base-silhouette');
      if (!base) {
        const dropLabelWrapper = dropZone.querySelector('.drop-label-wrapper');
        if (dropLabelWrapper) dropLabelWrapper.style.display = 'flex';
        const dropLabel = dropZone.querySelector('.drop-label');
        if (dropLabel) dropLabel.style.display = 'block';
      }
    });
  }

  if (inventoryTray) {
    enableRackDragScroll(inventoryTray);
  }
});

async function fetchAndCutoutImage(url, sourceUrl = null) {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    const reader = new FileReader();
    reader.onload = (e) => cutoutWhiteBackground(e.target.result, sourceUrl || url);
    reader.readAsDataURL(blob);
  } catch (err) {
    console.warn("Direct fetch blocked by CORS, converting via canvas:", err);
    convertToDataUrlAndCutout(url, sourceUrl);
  }
}

function convertToDataUrlAndCutout(url, sourceUrl) {
  const img = new Image();
  img.crossOrigin = "Anonymous";
  img.onload = () => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || 300;
      canvas.height = img.naturalHeight || 300;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const dataUrl = canvas.toDataURL('image/png');
      cutoutWhiteBackground(dataUrl, sourceUrl || url);
    } catch (e) {
      cutoutWhiteBackground(url, sourceUrl || url);
    }
  };
  img.onerror = () => cutoutWhiteBackground(url, sourceUrl || url);
  img.src = url;
}

function cutoutWhiteBackground(imageSource, sourceUrl = null) {
  const img = new Image();
  img.crossOrigin = "Anonymous";
  img.src = imageSource;

  img.onload = () => {
    try {
      if (!img.naturalWidth || !img.naturalHeight) throw new Error("Invalid image dimensions.");
      const transparentDataUrl = processBackgroundRemoval(img);
      createGarmentCard(transparentDataUrl, false, sourceUrl);
    } catch (err) {
      createGarmentCard(imageSource, false, sourceUrl);
    }
  };

  img.onerror = () => createGarmentCard(imageSource, false, sourceUrl);
}

function processBackgroundRemoval(imgElement) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const width = imgElement.naturalWidth || imgElement.width || 300;
  const height = imgElement.naturalHeight || imgElement.height || 300;
  canvas.width = width;
  canvas.height = height;

  ctx.drawImage(imgElement, 0, 0);

  let imgData;
  try {
    imgData = ctx.getImageData(0, 0, width, height);
  } catch (e) {
    return imgElement.src;
  }

  const data = imgData.data;

  // Sample corner pixels for baseline background color
  const corners = [
    (0 * width + 0) * 4,
    (0 * width + (width - 1)) * 4,
    ((height - 1) * width + 0) * 4,
    ((height - 1) * width + (width - 1)) * 4
  ];

  let totalR = 0, totalG = 0, totalB = 0;
  corners.forEach(idx => {
    totalR += data[idx];
    totalG += data[idx + 1];
    totalB += data[idx + 2];
  });

  const bgR = totalR / 4;
  const bgG = totalG / 4;
  const bgB = totalB / 4;

  if (bgR < 180 || bgG < 180 || bgB < 180) return imgElement.src;

  const visited = new Uint8Array(width * height);
  const queue = [];

  // Seed flood-fill from all 4 outer borders so it enters all inner gaps (necklines, straps, armholes)
  for (let x = 0; x < width; x++) {
    queue.push(x, 0);
    queue.push(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    queue.push(0, y);
    queue.push(width - 1, y);
  }

  while (queue.length > 0) {
    const y = queue.pop();
    const x = queue.pop();
    const idx = y * width + x;

    if (visited[idx]) continue;
    visited[idx] = 1;

    const dataIdx = idx * 4;
    const r = data[dataIdx];
    const g = data[dataIdx + 1];
    const b = data[dataIdx + 2];
    const a = data[dataIdx + 3];

    if (a === 0) continue;

    const dist = Math.sqrt(Math.pow(r - bgR, 2) + Math.pow(g - bgG, 2) + Math.pow(b - bgB, 2));

    // Smart Dual-Threshold Engine:
    // 1. Pure/near-white pixels get a generous threshold so fill flows smoothly through narrow strap gaps.
    // 2. Light grey, pastel, and colored garments are strictly protected.
    const isPureWhiteBg = (r >= 235 && g >= 235 && b >= 235 && Math.abs(r - g) < 12 && Math.abs(g - b) < 12);
    const isGarmentColor = (r < 235 || g < 235 || b < 235) || (Math.abs(r - g) >= 12 || Math.abs(g - b) >= 12);

    let shouldRemove = false;
    if (isPureWhiteBg && dist <= 55) {
      shouldRemove = true;
    } else if (!isGarmentColor && dist <= 25) {
      shouldRemove = true;
    }

    if (shouldRemove) {
      data[dataIdx + 3] = 0;

      if (x > 0) queue.push(x - 1, y);
      if (x < width - 1) queue.push(x + 1, y);
      if (y > 0) queue.push(x, y - 1);
      if (y < height - 1) queue.push(x, y + 1);
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return canvas.toDataURL('image/png');
}

function saveRackToStorage() {
  const tray = document.getElementById('inventory-tray');
  if (!tray || typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) return;

  const rackData = [];
  const items = tray.querySelectorAll('.inventory-item');

  items.forEach(item => {
    const img = item.querySelector('img');
    const linkBtn = item.querySelector('.inventory-link-btn');
    if (img && img.src) {
      rackData.push({ src: img.src, sourceUrl: linkBtn ? linkBtn.href : null });
    }
  });

  chrome.storage.local.set({ savedGarmentRack: rackData });
}

function loadRackFromStorage() {
  if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) return;

  chrome.storage.local.get(['savedGarmentRack'], (result) => {
    if (result.savedGarmentRack && Array.isArray(result.savedGarmentRack)) {
      result.savedGarmentRack.forEach(item => {
        addToInventory(item.src, item.sourceUrl, false);
      });
    }
  });
}

function setBaseSilhouette(src) {
  const dropZone = document.getElementById('drop-zone');
  if (!dropZone) return;

  const existingBase = dropZone.querySelector('.base-silhouette');
  if (existingBase) existingBase.remove();

  const dropLabelWrapper = dropZone.querySelector('.drop-label-wrapper');
  if (dropLabelWrapper) dropLabelWrapper.style.display = 'none';

  const baseWrapper = document.createElement('div');
  baseWrapper.className = 'base-silhouette';

  const baseImg = document.createElement('img');
  baseImg.src = src;

  baseWrapper.appendChild(baseImg);
  dropZone.insertAdjacentElement('afterbegin', baseWrapper);
}

function addToInventory(src, sourceUrl = null, shouldSave = true) {
  const tray = document.getElementById('inventory-tray');
  const countEl = document.getElementById('inventory-count');
  if (!tray) return;

  const emptyNotice = tray.querySelector('.inventory-empty-notice');
  if (emptyNotice) emptyNotice.remove();

  const item = document.createElement('div');
  item.className = 'inventory-item';
  item.title = 'Click to re-add to canvas';

  const img = document.createElement('img');
  img.src = src;
  item.appendChild(img);

  const removeBtn = document.createElement('button');
  removeBtn.className = 'inventory-remove-btn';
  removeBtn.innerText = '×';
  removeBtn.title = 'Remove item from rack';
  removeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    item.remove();
    const totalItems = tray.querySelectorAll('.inventory-item').length;
    if (countEl) countEl.innerText = totalItems > 0 ? `${totalItems} ITEM${totalItems > 1 ? 'S' : ''}` : '0 ITEMS';
    saveRackToStorage();
  });
  item.appendChild(removeBtn);

  if (sourceUrl && sourceUrl.startsWith('http')) {
    const linkBtn = document.createElement('a');
    linkBtn.className = 'inventory-link-btn';
    linkBtn.href = sourceUrl;
    linkBtn.target = '_blank';
    linkBtn.title = 'Open product webpage';
    linkBtn.innerText = '↗';
    linkBtn.addEventListener('click', (e) => e.stopPropagation());
    item.appendChild(linkBtn);
  }

  item.addEventListener('click', () => {
    createGarmentCard(src, true, sourceUrl);
  });

  tray.appendChild(item);

  const totalItems = tray.querySelectorAll('.inventory-item').length;
  if (countEl) countEl.innerText = `${totalItems} ITEM${totalItems > 1 ? 'S' : ''}`;

  if (shouldSave) saveRackToStorage();
}

function createGarmentCard(src, isFromInventory = false, sourceUrl = null) {
  const dropZone = document.getElementById('drop-zone');
  if (!dropZone) return;

  const dropLabelWrapper = dropZone.querySelector('.drop-label-wrapper');
  if (dropLabelWrapper) dropLabelWrapper.style.display = 'none';

  if (!isFromInventory) {
    addToInventory(src, sourceUrl);
  }

  const card = document.createElement('div');
  card.className = 'garment-card';
  card.style.position = 'absolute';
  card.style.left = '30px';
  card.style.top = '30px';
  card.style.width = '180px';
  card.style.zIndex = ++window.topZIndex;

  let currentRotation = 0;

  function updateCardTransform() {
    card.style.transform = `rotate(${currentRotation}deg)`;
  }

  const img = document.createElement('img');
  img.src = src;
  img.draggable = false;
  img.style.width = '100%';
  img.style.height = 'auto';
  img.style.display = 'block';

  const tools = document.createElement('div');
  tools.className = 'canvas-garment-tools';
  tools.innerHTML = `
    <span>[ROT]</span>
    <button class="rot-left-btn" type="button">↺</button>
    <button class="rot-right-btn" type="button">↻</button>
  `;

  tools.querySelector('.rot-left-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    currentRotation = (currentRotation - 15) % 360;
    updateCardTransform();
  });

  tools.querySelector('.rot-right-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    currentRotation = (currentRotation + 15) % 360;
    updateCardTransform();
  });

  const controlBar = document.createElement('div');
  controlBar.className = 'card-controls';

  const btnUp = document.createElement('button');
  btnUp.className = 'ctrl-btn';
  btnUp.innerText = '▲';
  btnUp.title = 'Bring Forward';
  btnUp.onclick = (e) => {
    e.stopPropagation();
    let currentZ = parseInt(card.style.zIndex) || 1;
    card.style.zIndex = currentZ + 1;
  };

  const btnDown = document.createElement('button');
  btnDown.className = 'ctrl-btn';
  btnDown.innerText = '▼';
  btnDown.title = 'Send Backward';
  btnDown.onclick = (e) => {
    e.stopPropagation();
    let currentZ = parseInt(card.style.zIndex) || 1;
    if (currentZ > 1) card.style.zIndex = currentZ - 1;
  };

  const btnRemove = document.createElement('button');
  btnRemove.className = 'ctrl-btn btn-del';
  btnRemove.innerText = '×';
  btnRemove.title = 'Remove Garment';
  btnRemove.onclick = (e) => {
    e.stopPropagation();
    card.remove();
  };

  controlBar.appendChild(btnUp);
  controlBar.appendChild(btnDown);
  controlBar.appendChild(btnRemove);

  const resizeHandle = document.createElement('div');
  resizeHandle.className = 'resize-handle';
  resizeHandle.style.position = 'absolute';
  resizeHandle.style.width = '14px';
  resizeHandle.style.height = '14px';
  resizeHandle.style.backgroundColor = '#CCFF00';
  resizeHandle.style.border = '1px solid #000000';
  resizeHandle.style.right = '-6px';
  resizeHandle.style.bottom = '-6px';
  resizeHandle.style.cursor = 'se-resize';
  resizeHandle.style.zIndex = '50';

  card.appendChild(tools);
  card.appendChild(controlBar);
  card.appendChild(img);
  card.appendChild(resizeHandle);
  dropZone.appendChild(card);

  card.addEventListener('pointerdown', (e) => {
    if (e.target.tagName === 'BUTTON' || e.target.classList.contains('resize-handle')) return;
    document.querySelectorAll('.garment-card').forEach(el => el.classList.remove('is-selected'));
    card.classList.add('is-selected');
    card.style.zIndex = ++window.topZIndex;
  });

  makeElementDraggableAndResizable(card, resizeHandle);
}

function makeElementDraggableAndResizable(elmnt, resizeHandle) {
  elmnt.onpointerdown = (e) => {
    if (e.target.classList.contains('resize-handle') || e.target.classList.contains('ctrl-btn') || e.target.tagName === 'BUTTON') return;

    e.preventDefault();
    elmnt.style.zIndex = ++window.topZIndex;

    let startX = e.clientX;
    let startY = e.clientY;
    let startLeft = elmnt.offsetLeft;
    let startTop = elmnt.offsetTop;

    function onDragMove(pe) {
      elmnt.style.left = `${startLeft + (pe.clientX - startX)}px`;
      elmnt.style.top = `${startTop + (pe.clientY - startY)}px`;
    }

    function onDragUp() {
      window.removeEventListener('pointermove', onDragMove);
      window.removeEventListener('pointerup', onDragUp);
    }

    window.addEventListener('pointermove', onDragMove);
    window.addEventListener('pointerup', onDragUp);
  };

  resizeHandle.onpointerdown = (e) => {
    e.preventDefault();
    e.stopPropagation();

    elmnt.style.zIndex = ++window.topZIndex;

    const startX = e.clientX;
    const startWidth = elmnt.offsetWidth;

    function onResizeMove(pe) {
      const newWidth = startWidth + (pe.clientX - startX);
      if (newWidth >= 40 && newWidth <= 450) {
        elmnt.style.width = `${newWidth}px`;
      }
    }

    function onResizeUp() {
      window.removeEventListener('pointermove', onResizeMove);
      window.removeEventListener('pointerup', onResizeUp);
    }

    window.addEventListener('pointermove', onResizeMove);
    window.addEventListener('pointerup', onResizeUp);
  };
}

function enableRackDragScroll(tray) {
  let isDown = false;
  let startX;
  let scrollLeft;

  tray.addEventListener('mousedown', (e) => {
    if (e.target.tagName === 'BUTTON' || e.target.tagName === 'A') return;
    isDown = true;
    tray.classList.add('active');
    startX = e.pageX - tray.offsetLeft;
    scrollLeft = tray.scrollLeft;
  });

  tray.addEventListener('mouseleave', () => {
    isDown = false;
    tray.classList.remove('active');
  });

  tray.addEventListener('mouseup', () => {
    isDown = false;
    tray.classList.remove('active');
  });

  tray.addEventListener('mousemove', (e) => {
    if (!isDown) return;
    e.preventDefault();
    const x = e.pageX - tray.offsetLeft;
    const walk = (x - startX) * 1.8;
    tray.scrollLeft = scrollLeft - walk;
  });
}

function saveCanvasImage() {
  const dropZone = document.getElementById('drop-zone');
  if (!dropZone) return;

  const rect = dropZone.getBoundingClientRect();
  const scale = 2; 

  const padTop = 20;
  const padSide = 20;
  const padBottom = 80;

  const baseWidth = rect.width + (padSide * 2);
  const baseHeight = rect.height + padTop + padBottom;

  const canvas = document.createElement('canvas');
  canvas.width = baseWidth * scale;
  canvas.height = baseHeight * scale;

  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.scale(scale, scale);

  ctx.fillStyle = '#FAFAFA';
  ctx.fillRect(0, 0, baseWidth, baseHeight);

  ctx.strokeStyle = '#E0E0E0';
  ctx.lineWidth = 1;
  ctx.strokeRect(0, 0, baseWidth, baseHeight);

  const photoX = padSide;
  const photoY = padTop;
  const photoW = rect.width;
  const photoH = rect.height;

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(photoX, photoY, photoW, photoH);

  const activeClass = Array.from(dropZone.classList).find(cls => cls.startsWith('bg-'));

  const finishExport = () => {
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.08)';
    ctx.lineWidth = 1;
    ctx.strokeRect(photoX, photoY, photoW, photoH);

    const imagesToDraw = [];
    const baseImg = dropZone.querySelector('.base-silhouette img');
    if (baseImg) {
      imagesToDraw.push({ img: baseImg, x: photoX, y: photoY, width: photoW, height: photoH, zIndex: 0 });
    }

    const cards = dropZone.querySelectorAll('.garment-card');
    cards.forEach(card => {
      const img = card.querySelector('img');
      if (img) {
        const cardRect = card.getBoundingClientRect();
        const zIndex = parseInt(card.style.zIndex) || 1;
        imagesToDraw.push({
          img: img,
          x: photoX + (cardRect.left - rect.left),
          y: photoY + (cardRect.top - rect.top),
          width: cardRect.width,
          height: cardRect.height,
          zIndex: zIndex
        });
      }
    });

    imagesToDraw.sort((a, b) => a.zIndex - b.zIndex);

    imagesToDraw.forEach(item => {
      try {
        ctx.drawImage(item.img, item.x, item.y, item.width, item.height);
      } catch (e) {
        console.warn("Could not render layer:", e);
      }
    });

    ctx.save();
    ctx.font = '22px "VT323", monospace';
    ctx.fillStyle = '#000000';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('[STYLED ON WHATEVER...]', baseWidth / 2, photoY + photoH + (padBottom / 2));
    ctx.restore();

    try {
      const link = document.createElement('a');
      link.download = `polaroid-fit-${Date.now()}.png`;
      link.href = canvas.toDataURL('image/png', 1.0);
      link.click();
    } catch (err) {
      console.error("Failed to generate download URL:", err);
      alert("Export failed because one or more dropped images blocked CORS access. Try re-uploading or pasting the image directly.");
    }
  };

  const bgPathMap = {
    'bg-crumpled-grid': 'assets/paper-texture.jpg',
    'bg-dotted-paper': 'assets/dotted.jpeg',
    'bg-folded-paper': 'assets/folded.jpeg',
    'bg-engineering': 'assets/journal.jpeg',
    'bg-kitty-grid': 'assets/kitty.jpeg',
    'bg-lace-lined': 'assets/lace.jpeg',
    'bg-foil-embossed': 'assets/foil.jpeg'
  };

  if (activeClass && bgPathMap[activeClass]) {
    const bgImg = new Image();
    bgImg.onload = () => {
      try { ctx.drawImage(bgImg, photoX, photoY, photoW, photoH); } catch (e) {}
      finishExport();
    };
    bgImg.onerror = () => finishExport();
    bgImg.src = bgPathMap[activeClass];
  } else {
    finishExport();
  }
}