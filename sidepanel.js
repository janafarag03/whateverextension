// Global z-index tracker for layer stacking
let topZIndex = 10;

document.addEventListener('DOMContentLoaded', () => {
  const dropZone = document.getElementById('drop-zone');
  const clearBtn = document.getElementById('btn-clear-board');
  const saveBtn = document.getElementById('btn-save-canvas');

  // Drag & drop behavior setup
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
  }

  function handleDrop(e) {
    const dt = e.dataTransfer;
    const imageUrl = dt.getData('text/uri-list') || dt.getData('text/plain');

    if (imageUrl) {
      fetchAndCutoutImage(imageUrl);
    } else if (dt.files && dt.files.length > 0) {
      Array.from(dt.files).forEach(file => {
        if (file.type.startsWith('image/')) {
          const reader = new FileReader();
          reader.onload = (event) => cutoutWhiteBackground(event.target.result);
          reader.readAsDataURL(file);
        }
      });
    }
  }

  async function fetchAndCutoutImage(url) {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      cutoutWhiteBackground(objectUrl);
    } catch (err) {
      console.warn("Could not fetch image bytes, falling back to original:", err);
      createGarmentCard(url);
    }
  }

  function cutoutWhiteBackground(imageSource) {
    const img = new Image();
    img.src = imageSource;

    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);

      try {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        for (let i = 0; i < data.length; i += 4) {
          if (data[i] > 200 && data[i + 1] > 200 && data[i + 2] > 200) {
            data[i + 3] = 0;
          }
        }

        ctx.putImageData(imageData, 0, 0);
        createGarmentCard(canvas.toDataURL('image/png'));
      } catch (err) {
        createGarmentCard(imageSource);
      }
    };

    img.onerror = () => createGarmentCard(imageSource);
  }

  // Base Photo Clipboard Paste Event Listener (Ctrl+V / Cmd+V)
  document.addEventListener('paste', (e) => {
    const items = e.clipboardData && e.clipboardData.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile();
        const reader = new FileReader();

        reader.onload = (event) => {
          setBaseSilhouette(event.target.result);
        };

        reader.readAsDataURL(file);
        break;
      }
    }
  });

  // Save Canvas Action
  if (saveBtn) {
    saveBtn.addEventListener('click', saveCanvasImage);
  }

  // Clear Board Action
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (!dropZone) return;

      // Remove garment cards from canvas
      const cards = dropZone.querySelectorAll('.garment-card');
      cards.forEach(card => card.remove());

      // Restore drop zone labels if no base photo exists
      const base = dropZone.querySelector('.base-silhouette');
      if (!base) {
        const dropLabelWrapper = dropZone.querySelector('.drop-label-wrapper');
        if (dropLabelWrapper) dropLabelWrapper.style.display = 'flex';

        const dropLabel = dropZone.querySelector('.drop-label');
        if (dropLabel) dropLabel.style.display = 'block';
      }
    });
  }
});

// Set Base Photo Function
function setBaseSilhouette(src) {
  const dropZone = document.getElementById('drop-zone');
  if (!dropZone) return;

  const existingBase = dropZone.querySelector('.base-silhouette');
  if (existingBase) existingBase.remove();

  const dropLabelWrapper = dropZone.querySelector('.drop-label-wrapper');
  if (dropLabelWrapper) dropLabelWrapper.style.display = 'none';

  const dropLabel = dropZone.querySelector('.drop-label');
  if (dropLabel) dropLabel.style.display = 'none';

  const baseWrapper = document.createElement('div');
  baseWrapper.className = 'base-silhouette';

  const baseImg = document.createElement('img');
  baseImg.src = src;

  baseWrapper.appendChild(baseImg);
  dropZone.insertAdjacentElement('afterbegin', baseWrapper);
}

// Add Item to Inventory Rack
function addToInventory(src) {
  const tray = document.getElementById('inventory-tray');
  const countEl = document.getElementById('inventory-count');
  if (!tray) return;

  // Remove placeholder text on first addition
  const emptyNotice = tray.querySelector('.inventory-empty-notice');
  if (emptyNotice) emptyNotice.remove();

  const item = document.createElement('div');
  item.className = 'inventory-item';
  item.title = 'Click to re-add to canvas';

  const img = document.createElement('img');
  img.src = src;

  item.appendChild(img);
  tray.appendChild(item);

  // Re-spawn card to canvas when clicked from inventory rack
  item.addEventListener('click', () => {
    createGarmentCard(src, true);
  });

  // Update item counter label
  const totalItems = tray.querySelectorAll('.inventory-item').length;
  if (countEl) countEl.innerText = `${totalItems} ITEM${totalItems > 1 ? 'S' : ''}`;
}

// Card Creation & Interaction Functions
function createGarmentCard(src, isFromInventory = false) {
  const dropZone = document.getElementById('drop-zone');
  if (!dropZone) return;

  const dropLabelWrapper = dropZone.querySelector('.drop-label-wrapper');
  if (dropLabelWrapper) dropLabelWrapper.style.display = 'none';

  const dropLabel = dropZone.querySelector('.drop-label');
  if (dropLabel) dropLabel.style.display = 'none';

  // Save to inventory rack automatically unless spawned from it
  if (!isFromInventory) {
    addToInventory(src);
  }

  topZIndex += 1;

  const card = document.createElement('div');
  card.className = 'garment-card';
  card.style.left = '30px';
  card.style.top = '30px';
  card.style.zIndex = topZIndex;

  const img = document.createElement('img');
  img.src = src;
  img.draggable = false;

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

  card.appendChild(controlBar);
  card.appendChild(img);
  card.appendChild(resizeHandle);
  dropZone.appendChild(card);

  makeElementDraggableAndResizable(card, resizeHandle);
}

// Drag & Resize Handlers
function makeElementDraggableAndResizable(elmnt, resizeHandle) {
  elmnt.onpointerdown = (e) => {
    if (e.target.classList.contains('resize-handle') || e.target.classList.contains('ctrl-btn')) return;

    e.preventDefault();
    elmnt.style.zIndex = ++topZIndex;

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

    elmnt.style.zIndex = ++topZIndex;

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

// Export fitting room canvas as a PNG image
function saveCanvasImage() {
  const dropZone = document.getElementById('drop-zone');
  if (!dropZone) return;

  const rect = dropZone.getBoundingClientRect();
  const canvas = document.createElement('canvas');
  canvas.width = rect.width;
  canvas.height = rect.height;
  const ctx = canvas.getContext('2d');

  // Fill background
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Gather base silhouette and garment images
  const imagesToDraw = [];

  // 1. Check Base Silhouette
  const baseImg = dropZone.querySelector('.base-silhouette img');
  if (baseImg) {
    imagesToDraw.push({
      img: baseImg,
      x: 0,
      y: 0,
      width: rect.width,
      height: rect.height,
      zIndex: 0
    });
  }

  // 2. Check Garment Cards (Sorted by zIndex)
  const cards = dropZone.querySelectorAll('.garment-card');
  cards.forEach(card => {
    const img = card.querySelector('img');
    if (img) {
      const cardRect = card.getBoundingClientRect();
      const zIndex = parseInt(card.style.zIndex) || 1;
      imagesToDraw.push({
        img: img,
        x: cardRect.left - rect.left,
        y: cardRect.top - rect.top,
        width: cardRect.width,
        height: cardRect.height,
        zIndex: zIndex
      });
    }
  });

  // Sort elements sequentially by layer order
  imagesToDraw.sort((a, b) => a.zIndex - b.zIndex);

  // Render all elements onto canvas
  imagesToDraw.forEach(item => {
    try {
      ctx.drawImage(item.img, item.x, item.y, item.width, item.height);
    } catch (e) {
      console.error("Could not draw image to canvas:", e);
    }
  });

  // Trigger file download
  const link = document.createElement('a');
  link.download = `fitting-room-${Date.now()}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}