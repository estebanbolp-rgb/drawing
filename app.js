class WhiteboardStudio {
    constructor() {
        this.whiteboard = document.getElementById('whiteboard');
        this.svg = document.getElementById('main-svg');
        this.hand = document.getElementById('drawing-hand');
        this.handImg = this.hand.querySelector('img');
        this.playBtn = document.getElementById('play-btn');
        this.exportBtn = document.getElementById('export-btn');
        this.clearBtn = document.getElementById('clear-btn');
        this.speedInput = document.getElementById('speed');
        this.handSizeInput = document.getElementById('hand-size');
        this.fileInput = document.getElementById('image-upload');
        this.slidesContainer = document.getElementById('slides-container');
        this.addSlideBtn = document.getElementById('add-slide-btn');
        
        this.recordingCanvas = document.getElementById('recording-canvas');
        this.ctx = this.recordingCanvas.getContext('2d');
        
        // Multi-slide state
        this.slides = [{ elements: [] }];
        this.currentSlideIndex = 0;
        
        this.isAnimating = false;
        this.isRecording = false;
        
        this.init();
    }

    async init() {
        await this.processHandImage();

        this.playBtn.addEventListener('click', () => this.animateAllSequentially());
        this.exportBtn.addEventListener('click', () => this.startExport());
        this.clearBtn.addEventListener('click', () => this.clearCurrentSlide());
        this.addSlideBtn.addEventListener('click', () => this.addSlide());
        
        this.handSizeInput.addEventListener('input', (e) => {
            this.hand.style.width = `${e.target.value}px`;
        });

        document.querySelectorAll('.asset-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const type = btn.dataset.type;
                if (type === 'text') this.showTextModal();
                else if (type === 'upload') this.fileInput.click();
                else this.addShape(btn.dataset.shape);
            });
        });

        this.fileInput.addEventListener('change', (e) => this.handleImageUpload(e));

        const modal = document.getElementById('text-modal');
        const textInput = document.getElementById('text-input');
        document.getElementById('cancel-text').addEventListener('click', () => modal.style.display = 'none');
        document.getElementById('add-text-confirm').addEventListener('click', () => {
            if (textInput.value) {
                this.addText(textInput.value);
                modal.style.display = 'none';
                textInput.value = '';
            }
        });

        // Drag and Drop Logic
        this.setupDragAndDrop();
        
        this.renderSlideThumbs();
    }

    setupDragAndDrop() {
        this.dragElement = null;
        this.isDragging = false;
        this.dragOffset = { x: 0, y: 0 };

        this.whiteboard.addEventListener('mousedown', (e) => {
            if (this.isAnimating) return;
            
            const target = e.target;
            const elementData = this.findElementData(target);
            
            // Clear previous selection
            document.querySelectorAll('.selected-element').forEach(el => el.classList.remove('selected-element'));

            if (elementData) {
                this.dragElement = elementData;
                this.isDragging = true;
                
                // Add visual selection
                elementData.element.classList.add('selected-element');

                const pt = this.getSVGPoint(e);
                this.dragOffset = {
                    x: pt.x - (elementData.x || 0),
                    y: pt.y - (elementData.y || 0)
                };
                
                e.preventDefault();
            }
        });

        window.addEventListener('mousemove', (e) => {
            if (!this.isDragging || !this.dragElement) return;
            
            const pt = this.getSVGPoint(e);
            const newX = pt.x - this.dragOffset.x;
            const newY = pt.y - this.dragOffset.y;
            
            this.updateElementPosition(this.dragElement, newX, newY);
        });

        window.addEventListener('mouseup', () => {
            if (this.isDragging) {
                this.isDragging = false;
                // Keep the dragElement reference for possible selection logic later
            }
        });
    }

    findElementData(domElement) {
        // SVG elements are targets directly, images are also targets
        // We need to traverse up to find our registered elements
        const currentElements = this.slides[this.currentSlideIndex].elements;
        let current = domElement;
        
        while (current && current !== this.whiteboard) {
            const found = currentElements.find(el => el.element === current);
            if (found) return found;
            current = current.parentElement;
        }
        return null;
    }

    getSVGPoint(e) {
        // This gives us coordinates in the SVG's 1200x800 system
        const pt = this.svg.createSVGPoint();
        pt.x = e.clientX;
        pt.y = e.clientY;
        const ctm = this.svg.getScreenCTM();
        if (!ctm) return { x: 0, y: 0 };
        return pt.matrixTransform(ctm.inverse());
    }

    updateElementPosition(elData, x, y) {
        elData.x = x;
        elData.y = y;

        if (elData.type === 'image') {
            const scale = this.whiteboard.offsetWidth / 1200;
            elData.element.style.left = `${x * scale}px`;
            elData.element.style.top = `${y * scale}px`;
        } else if (elData.type === 'text') {
            elData.element.setAttribute('x', x);
            elData.element.setAttribute('y', y);
        } else if (elData.type === 'path') {
            // For paths, we need to translate the whole D string
            // This is complex, so simpler is to use transform attribute
            elData.element.setAttribute('transform', `translate(${x - elData.initialX}, ${y - elData.initialY})`);
        }
    }

    async processHandImage() {
        return new Promise(resolve => {
            const img = new Image();
            img.src = 'hand.png';
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width; canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const data = imageData.data;
                for (let i = 0; i < data.length; i += 4) {
                    if (data[i] > 240 && data[i+1] > 240 && data[i+2] > 240) data[i+3] = 0;
                }
                ctx.putImageData(imageData, 0, 0);
                this.handImg.src = canvas.toDataURL();
                resolve();
            };
        });
    }

    // --- Slide Management ---
    addSlide() {
        this.slides.push({ elements: [] });
        this.switchSlide(this.slides.length - 1);
    }

    switchSlide(index) {
        this.currentSlideIndex = index;
        this.renderCurrentSlide();
        this.renderSlideThumbs();
    }

    renderCurrentSlide() {
        // Clear current view
        this.svg.innerHTML = '';
        document.querySelectorAll('.canvas-image').forEach(el => el.remove());
        
        const currentSlide = this.slides[this.currentSlideIndex];
        currentSlide.elements.forEach(el => {
            if (el.type === 'image') {
                this.whiteboard.insertBefore(el.element, this.hand);
            } else {
                this.svg.appendChild(el.element);
            }
        });
    }

    renderSlideThumbs() {
        this.slidesContainer.innerHTML = '';
        this.slides.forEach((slide, index) => {
            const thumb = document.createElement('div');
            thumb.className = `slide-thumb ${index === this.currentSlideIndex ? 'active' : ''}`;
            thumb.innerText = `Diapositiva ${index + 1}`;
            thumb.onclick = () => this.switchSlide(index);
            this.slidesContainer.appendChild(thumb);
        });
    }

    clearCurrentSlide() {
        this.slides[this.currentSlideIndex].elements = [];
        this.renderCurrentSlide();
    }

    // --- Asset Handling ---
    handleImageUpload(e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => this.addImage(event.target.result);
        reader.readAsDataURL(file);
    }

    addImage(src) {
        const img = document.createElement('img');
        img.src = src;
        img.className = 'canvas-image';
        const width = 200;
        const x = 200 + (this.slides[this.currentSlideIndex].elements.length * 50) % 600;
        const y = 200 + (this.slides[this.currentSlideIndex].elements.length * 30) % 400;
        img.style.width = `${width}px`; img.style.left = `${x}px`; img.style.top = `${y}px`;
        img.style.opacity = 1;
        this.whiteboard.insertBefore(img, this.hand);
        
        img.onload = () => {
            const h = img.naturalHeight * (width / img.naturalWidth);
            const found = this.slides[this.currentSlideIndex].elements.find(e => e.element === img);
            if (found) found.height = h;
        };
        
        this.slides[this.currentSlideIndex].elements.push({ type: 'image', element: img, x, y, width, height: 150 });
    }

    addShape(shapeType) {
        const centerX = 200 + (this.slides[this.currentSlideIndex].elements.length * 50) % 600;
        const centerY = 200 + (this.slides[this.currentSlideIndex].elements.length * 30) % 400;
        let pathData = '';
        if (shapeType === 'circle') pathData = `M ${centerX},${centerY} m -40,0 a 40,40 0 1,0 80,0 a 40,40 0 1,0 -80,0`;
        else if (shapeType === 'square') pathData = `M ${centerX-40},${centerY-40} L ${centerX+40},${centerY-40} L ${centerX+40},${centerY+40} L ${centerX-40},${centerY+40} Z`;
        else if (shapeType === 'star') pathData = `M ${centerX},${centerY-50} L ${centerX+15},${centerY-15} L ${centerX+50},${centerY-15} L ${centerX+25},${centerY+10} L ${centerX+35},${centerY+45} L ${centerX},${centerY+25} L ${centerX-35},${centerY+45} L ${centerX-25},${centerY+10} L ${centerX-50},${centerY-15} L ${centerX-15},${centerY-15} Z`;

        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute('d', pathData); 
        path.setAttribute('fill', 'transparent'); // Make middle clickable
        path.setAttribute('stroke', '#333');
        path.setAttribute('stroke-width', '4'); 
        path.setAttribute('stroke-linecap', 'round');
        path.setAttribute('pointer-events', 'auto');
        const length = path.getTotalLength();
        path.style.strokeDasharray = length; path.style.strokeDashoffset = 0;
        this.svg.appendChild(path);
        this.slides[this.currentSlideIndex].elements.push({ 
            type: 'path', 
            element: path, 
            length: length, 
            x: centerX, 
            y: centerY, 
            initialX: centerX, 
            initialY: centerY 
        });
    }

    addText(text) {
        const centerX = 200 + (this.slides[this.currentSlideIndex].elements.length * 50) % 600;
        const centerY = 200 + (this.slides[this.currentSlideIndex].elements.length * 30) % 400;
        const textEl = document.createElementNS("http://www.w3.org/2000/svg", "text");
        textEl.setAttribute('x', centerX); textEl.setAttribute('y', centerY);
        textEl.setAttribute('font-family', 'Outfit'); textEl.setAttribute('font-size', '48');
        textEl.setAttribute('fill', '#333'); 
        textEl.setAttribute('stroke', '#333'); 
        textEl.setAttribute('stroke-width', '1');
        textEl.setAttribute('pointer-events', 'auto');
        textEl.style.cursor = 'move';
        textEl.textContent = text;
        this.svg.appendChild(textEl);
        this.slides[this.currentSlideIndex].elements.push({ 
            type: 'text', 
            element: textEl, 
            text: text, 
            x: centerX, 
            y: centerY 
        });
    }

    showTextModal() {
        document.getElementById('text-modal').style.display = 'flex';
        document.getElementById('text-input').focus();
    }

    // --- Global Animation Logic ---
    async animateAllSequentially(isRecording = false) {
        if (this.isAnimating) return;
        this.isAnimating = true;
        this.playBtn.disabled = true; this.exportBtn.disabled = true;

        if (isRecording) {
            await this.startMediaRecorder();
            this.captureLoop = setInterval(() => this.captureFrame(), 1000 / 30);
        }

        try {
            for (let i = 0; i < this.slides.length; i++) {
                this.switchSlide(i);
                await this.animateCurrentSlide();
                if (i < this.slides.length - 1) await new Promise(r => setTimeout(r, 1000));
            }
        } catch (err) {
            console.error("Error durante la animación:", err);
        }

        if (isRecording) {
            clearInterval(this.captureLoop);
            // Give it a moment to catch the last frames
            await new Promise(r => setTimeout(r, 500));
            this.stopMediaRecorder();
        }

        this.isAnimating = false;
        this.playBtn.disabled = false; this.exportBtn.disabled = false;
    }

    async animateCurrentSlide() {
        const currentElements = this.slides[this.currentSlideIndex].elements;
        
        // Reset elements to invisible
        currentElements.forEach(el => {
            if (el.type === 'path') el.element.style.strokeDashoffset = el.length;
            else if (el.type === 'text') { el.element.style.opacity = 0; el.element.setAttribute('fill', 'none'); }
            else if (el.type === 'image') el.element.style.opacity = 0;
        });

        this.hand.style.display = 'block';
        this.hand.style.transition = 'none';
        this.updateHandPosition(600, 1000); // Start below
        
        await new Promise(r => setTimeout(r, 50));
        
        const firstPoint = this.getElementStartPoint(currentElements[0]);
        this.hand.style.transition = 'all 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)';
        this.updateHandPosition(firstPoint.x, firstPoint.y);
        
        await new Promise(r => setTimeout(r, 850));
        this.hand.style.transition = 'none';

        for (const el of currentElements) {
            if (el.type === 'path') await this.animatePath(el);
            else if (el.type === 'text') await this.animateText(el);
            else if (el.type === 'image') await this.animateImage(el);
        }

        this.hand.style.transition = 'all 0.6s ease-in';
        this.updateHandPosition(600, 1000); // Slide down
        await new Promise(r => setTimeout(r, 650));
        this.hand.style.display = 'none';
    }

    getElementStartPoint(el) {
        if (!el) return { x: 600, y: 400 };
        if (el.type === 'path') {
            const pt = el.element.getPointAtLength(0);
            return { x: pt.x + (el.x - el.initialX), y: pt.y + (el.y - el.initialY) };
        }
        if (el.type === 'text') { return { x: el.x, y: el.y }; }
        return { x: el.x, y: el.y };
    }

    animatePath(el) {
        return new Promise(resolve => {
            const path = el.element; const length = el.length;
            const speed = parseFloat(this.speedInput.value);
            const recordingSlowdown = this.mediaRecorder && this.mediaRecorder.state === 'recording' ? 1.5 : 1.0;
            const duration = (length / 100) / speed * 1000 * recordingSlowdown;
            const offsetX = el.x - (el.initialX || 0);
            const offsetY = el.y - (el.initialY || 0);
            
            let start = null;
            const step = (timestamp) => {
                if (!start) start = timestamp;
                const progress = timestamp - start;
                const percentage = Math.min(progress / duration, 1);
                path.style.strokeDashoffset = length * (1 - percentage);
                const point = path.getPointAtLength(length * percentage);
                this.updateHandPosition(point.x + offsetX, point.y + offsetY);
                if (percentage < 1) requestAnimationFrame(step); else resolve();
            };
            requestAnimationFrame(step);
        });
    }

    animateText(el) {
        return new Promise(resolve => {
            const textEl = el.element; const bbox = textEl.getBBox();
            const speed = parseFloat(this.speedInput.value);
            const recordingSlowdown = this.mediaRecorder && this.mediaRecorder.state === 'recording' ? 1.5 : 1.0;
            textEl.style.opacity = 1;
            const duration = (bbox.width / 50) / speed * 1000 * recordingSlowdown;
            let start = null;
            const step = (timestamp) => {
                if (!start) start = timestamp;
                const progress = timestamp - start;
                const percentage = Math.min(progress / duration, 1);
                const x = el.x + (bbox.width * percentage);
                const y = el.y + bbox.height/2 + Math.sin(percentage * 20) * 5;
                this.updateHandPosition(x, y);
                if (percentage > 0.8) { textEl.setAttribute('fill', '#333'); textEl.style.transition = 'fill 0.5s'; }
                if (percentage < 1) requestAnimationFrame(step); else resolve();
            };
            requestAnimationFrame(step);
        });
    }

    animateImage(el) {
        return new Promise(resolve => {
            const img = el.element; const speed = parseFloat(this.speedInput.value);
            const recordingSlowdown = this.mediaRecorder && this.mediaRecorder.state === 'recording' ? 1.5 : 1.0;
            const duration = 2500 / speed * recordingSlowdown;
            let start = null;
            const step = (timestamp) => {
                if (!start) start = timestamp;
                const progress = timestamp - start;
                const percentage = Math.min(progress / duration, 1);
                
                // More dense "coloring" zigzag
                const rows = 12; // Even denser
                const row = Math.floor(percentage * rows);
                const xInRow = (percentage * rows) % 1;
                
                const x = el.x + (row % 2 === 0 ? xInRow * el.width : (1 - xInRow) * el.width);
                const y = el.y + (row / rows) * (el.height || 150);
                
                this.updateHandPosition(x, y);
                img.style.opacity = percentage;
                if (percentage < 1) requestAnimationFrame(step); else resolve();
            };
            requestAnimationFrame(step);
        });
    }

    updateHandPosition(x, y) {
        const rect = this.svg.getBoundingClientRect();
        const viewBox = this.svg.viewBox.baseVal;
        const scaleX = rect.width / viewBox.width; const scaleY = rect.height / viewBox.height;
        this.hand.style.left = `${x * scaleX}px`; this.hand.style.top = `${y * scaleY}px`;
    }
    async startExport() {
        console.log("Iniciando exportación...");
        const overlay = document.getElementById('export-overlay');
        overlay.style.display = 'flex';
        
        try {
            await this.animateAllSequentially(true);
        } catch (err) {
            console.error("Error en exportación:", err);
            alert("Error al exportar video.");
            overlay.style.display = 'none';
        }
    }

    async startMediaRecorder() {
        return new Promise((resolve, reject) => {
            try {
                this.recordedChunks = [];
                const stream = this.recordingCanvas.captureStream(30);
                
                const types = [
                    'video/mp4;codecs=h264,aac',
                    'video/mp4',
                    'video/webm;codecs=vp9',
                    'video/webm'
                ];
                
                let selectedType = 'video/webm';
                for (const type of types) {
                    if (MediaRecorder.isTypeSupported(type)) {
                        selectedType = type;
                        break;
                    }
                }

                console.log("Recorder seleccionado:", selectedType);
                this.mediaRecorder = new MediaRecorder(stream, { 
                    mimeType: selectedType,
                    videoBitsPerSecond: 5000000 
                });
                
                this.mediaRecorder.ondataavailable = (e) => {
                    if (e.data.size > 0) this.recordedChunks.push(e.data);
                };
                
                this.mediaRecorder.onstop = () => {
                    const extension = selectedType.includes('mp4') ? 'mp4' : 'webm';
                    const blob = new Blob(this.recordedChunks, { type: selectedType });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `whiteboard_animacion.${extension}`;
                    document.body.appendChild(a);
                    a.click();
                    setTimeout(() => {
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                        document.getElementById('export-overlay').style.display = 'none';
                    }, 100);
                };
                
                this.mediaRecorder.start(100); // Collect data every 100ms
                setTimeout(resolve, 200); // Wait for recorder to warm up
            } catch (err) {
                reject(err);
            }
        });
    }

    stopMediaRecorder() { if (this.mediaRecorder) this.mediaRecorder.stop(); }

    async captureFrame() {
        const ctx = this.ctx; const canvas = this.recordingCanvas;
        ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
        const scale = canvas.width / 1200;
        const currentElements = this.slides[this.currentSlideIndex].elements;

        currentElements.filter(el => el.type === 'image').forEach(el => {
            if (el.element.style.opacity > 0) {
                ctx.globalAlpha = parseFloat(el.element.style.opacity);
                const h = el.height || (el.element.naturalHeight * (el.width / el.element.naturalWidth));
                ctx.drawImage(el.element, el.x * scale, el.y * scale, el.width * scale, h * scale);
            }
        });
        
        ctx.globalAlpha = 1.0; ctx.lineCap = "round"; ctx.lineJoin = "round";
        currentElements.forEach(el => {
            if (el.type === 'path') {
                ctx.save();
                const tx = (el.x - (el.initialX || 0)) * scale;
                const ty = (el.y - (el.initialY || 0)) * scale;
                ctx.translate(tx, ty);
                
                const path = new Path2D(el.element.getAttribute('d'));
                ctx.strokeStyle = "#333"; ctx.lineWidth = 4 * scale;
                const dash = el.length - parseFloat(el.element.style.strokeDashoffset);
                ctx.setLineDash([dash, el.length]); ctx.stroke(path); ctx.setLineDash([]);
                ctx.restore();
            } else if (el.type === 'text') {
                if (el.element.style.opacity > 0) {
                    ctx.font = `${48 * scale}px Outfit`;
                    ctx.fillStyle = el.element.getAttribute('fill') || "transparent";
                    ctx.strokeStyle = "#333"; ctx.lineWidth = 1 * scale;
                    const x = el.x * scale; const y = el.y * scale;
                    ctx.strokeText(el.text, x, y); if (ctx.fillStyle !== "transparent") ctx.fillText(el.text, x, y);
                }
            }
        });

        const handRect = this.hand.getBoundingClientRect();
        const whiteboardRect = this.whiteboard.getBoundingClientRect();
        const handX = (handRect.left - whiteboardRect.left) * (canvas.width / whiteboardRect.width);
        const handY = (handRect.top - whiteboardRect.top) * (canvas.height / whiteboardRect.height);
        const handW = handRect.width * (canvas.width / whiteboardRect.width);
        const handH = handRect.height * (canvas.height / whiteboardRect.height);
        ctx.drawImage(this.handImg, handX - handW/2, handY - handH/2, handW, handH);
    }
}

window.addEventListener('DOMContentLoaded', () => new WhiteboardStudio());
