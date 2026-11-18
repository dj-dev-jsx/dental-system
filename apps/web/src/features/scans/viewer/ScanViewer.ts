import {
  AmbientLight,
  BufferAttribute,
  BufferGeometry,
  Color,
  DirectionalLight,
  DoubleSide,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  PerspectiveCamera,
  Raycaster,
  Vector2,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three'
import { TrackballControls } from 'three/examples/jsm/controls/TrackballControls.js'
import type { ParsedMesh } from './parseTypes'
import type { Vec3 } from './pinMath'

export type CameraState = { position: [number, number, number]; target: [number, number, number]; up: [number, number, number] }

/** Meshes with more triangles than this turn at a lower resolution while they move. */
const HEAVY_TRIANGLES = 1_500_000

/**
 * Plain three.js, no React: one scan on a transparent canvas (the page's black stage shows
 * through). It draws only when something changes, and frees everything in dispose().
 */
export class ScanViewer {
  private renderer: WebGLRenderer
  private scene = new Scene()
  private camera = new PerspectiveCamera(32, 1, 0.05, 50)
  private controls: TrackballControls
  /** The camera keeps moving for a moment after a drag ends (a short glide), so frames run while it does. */
  private loop = 0
  private interacting = false
  private idleFrames = 0
  private moved = false
  private material = new MeshStandardMaterial({ color: 0xdedede, roughness: 0.55, metalness: 0, side: DoubleSide })
  private mesh: Mesh | null = null
  private geometry: BufferGeometry | null = null
  private observer: ResizeObserver
  private listeners = new Set<() => void>()
  private viewListeners = new Set<() => void>()
  private quiet = false
  private heavy = false
  private pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5)
  private frame = 0
  private disposed = false
  private lost: (() => void) | null = null
  private fileColors: BufferAttribute | null = null
  private shading: BufferAttribute | null = null
  private wireframe = false
  private showFileColors = true
  private raycaster = new Raycaster()
  private home = { position: new Vector3(0, 0.7, 3.4), target: new Vector3() }
  private homeView: CameraState | null = null
  /** The file's own triangles; `visible` is the subset drawn while gums are hidden. */
  private fullIndex: BufferAttribute | null = null
  private overlay: Object3D | null = null
  private visible: BufferAttribute | null = null

  private container: HTMLElement

  constructor(container: HTMLElement) {
    this.container = container
    this.renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(this.pixelRatio)
    this.renderer.setClearColor(0x000000, 0)
    const canvas = this.renderer.domElement
    canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;outline:none'
    canvas.tabIndex = 0
    canvas.setAttribute('aria-label', '3D scan. Drag to turn, scroll or pinch to zoom, right-drag or two fingers to move.')
    container.appendChild(canvas)

    // A light that travels with the camera keeps the shape readable from every side, and
    // a soft sky/ground fill stops the shadow side going flat black.
    this.scene.add(new AmbientLight(0xffffff, 0.35))
    this.scene.add(new HemisphereLight(0xffffff, 0x4a4a4a, 0.8))
    const key = new DirectionalLight(0xffffff, 2.1)
    key.position.set(1.5, 2, 3)
    const fill = new DirectionalLight(0xffffff, 0.7)
    fill.position.set(-2.5, -1, 1.5)
    this.camera.add(key, fill)
    this.scene.add(this.camera)

    this.camera.position.copy(this.home.position)
    // Trackball turning, as dental CAD software does: the scan tumbles freely in any direction
    // (no stop at the top or bottom, so an arch can be tipped over to see the biting surface or
    // the gums). Left drag turns, right drag (or two fingers) moves, the wheel or a pinch zooms.
    this.controls = new TrackballControls(this.camera, canvas)
    this.controls.rotateSpeed = 3.2
    this.controls.zoomSpeed = 1.4
    this.controls.panSpeed = 0.9
    this.controls.staticMoving = false
    this.controls.dynamicDampingFactor = 0.28 // a short glide after letting go, not a long spin
    this.controls.minDistance = 0.4
    this.controls.maxDistance = 12
    // By default it also reacts to the A, S and D keys anywhere on the page; typing a note must not.
    this.controls.keys = ['', '', '']
    this.controls.addEventListener('change', this.onControls)
    this.controls.addEventListener('start', this.onStart)
    this.controls.addEventListener('end', this.onEnd)
    canvas.addEventListener('pointerdown', this.wake)
    canvas.addEventListener('wheel', this.wake, { passive: true })

    canvas.addEventListener('webglcontextlost', this.onLost)
    this.observer = new ResizeObserver(() => this.resize())
    this.observer.observe(container)
    this.resize()
  }

  /** Called when the browser takes the 3D context away (a busy computer). */
  onContextLost(callback: () => void) {
    this.lost = callback
  }

  private onLost = (event: Event) => {
    event.preventDefault()
    this.lost?.()
  }

  private onControls = () => {
    this.moved = true
    if (!this.quiet) this.listeners.forEach((listener) => listener())
  }

  private onStart = () => {
    this.interacting = true
    if (this.heavy) this.setRatio(1)
    this.wake()
  }

  private onEnd = () => {
    this.interacting = false
    this.wake()
  }

  /**
   * The trackball only moves the camera when update() runs, so frames run while the person
   * drags and until the glide settles, then stop again (nothing is drawn while nothing moves).
   */
  private wake = () => {
    this.idleFrames = 0
    if (this.loop || this.disposed) return
    const step = () => {
      this.loop = 0
      if (this.disposed) return
      this.controls.update()
      if (this.moved) {
        this.moved = false
        this.idleFrames = 0
        this.renderer.render(this.scene, this.camera)
        this.viewListeners.forEach((listener) => listener())
      } else {
        this.idleFrames++
      }
      if (this.interacting || this.idleFrames < 12) {
        this.loop = requestAnimationFrame(step)
      } else if (this.heavy) {
        // Back to full sharpness once the scan is still.
        this.setRatio(this.pixelRatio)
        this.draw()
      }
    }
    this.loop = requestAnimationFrame(step)
  }

  private setRatio(ratio: number) {
    this.renderer.setPixelRatio(ratio)
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight, false)
  }

  private resize() {
    const width = this.container.clientWidth
    const height = this.container.clientHeight
    if (width === 0 || height === 0) return
    this.renderer.setSize(width, height, false)
    this.camera.aspect = width / height
    // On a narrow stage keep the whole scan in view by widening the field of view.
    this.camera.fov = width / height < 1 ? 32 / Math.max(width / height, 0.62) : 32
    this.camera.updateProjectionMatrix()
    this.controls.handleResize()
    this.draw()
  }

  /** Asks for one frame; many requests in a row become one. */
  draw() {
    if (this.disposed || this.frame) return
    this.frame = requestAnimationFrame(() => {
      this.frame = 0
      if (this.disposed) return
      this.renderer.render(this.scene, this.camera)
      this.viewListeners.forEach((listener) => listener())
    })
  }

  setMesh(data: ParsedMesh) {
    const geometry = new BufferGeometry()
    this.filePositions = new BufferAttribute(data.positions, 3)
    this.shownPositions = null
    geometry.setAttribute('position', this.filePositions)
    geometry.setAttribute('normal', new BufferAttribute(data.normals, 3))
    if (data.colors) {
      this.fileColors = new BufferAttribute(data.colors, 3)
      geometry.setAttribute('color', this.fileColors)
    }
    if (data.index) {
      this.fullIndex = new BufferAttribute(data.index, 1)
      geometry.setIndex(this.fullIndex)
    }
    geometry.computeBoundingSphere()
    this.geometry = geometry
    this.heavy = data.triangles > HEAVY_TRIANGLES
    this.material.vertexColors = Boolean(data.colors)
    this.material.needsUpdate = true
    this.mesh = new Mesh(geometry, this.material)
    this.mesh.frustumCulled = false
    this.scene.add(this.mesh)
    this.resetView()
  }

  setWireframe(on: boolean) {
    this.wireframe = on
    this.refreshMaterial()
  }

  setColors(on: boolean) {
    this.showFileColors = on
    this.refreshMaterial()
  }

  /** Puts the right colours on: tooth shading wins over the file's own colours, wireframe over both. */
  private refreshMaterial() {
    const geometry = this.geometry
    if (!geometry) return
    this.material.wireframe = this.wireframe
    let colours = this.shading && !this.wireframe ? this.shading : this.showFileColors && !this.wireframe ? this.fileColors : null
    const collar = this.collar && !this.wireframe ? this.collar : null
    if (collar) colours = this.collared(colours, collar)
    if (colours) geometry.setAttribute('color', colours)
    else geometry.deleteAttribute('color')
    this.material.vertexColors = Boolean(colours)
    this.material.color.set(this.wireframe || this.shading || collar ? 0xffffff : 0xdedede)
    this.material.needsUpdate = true
    this.draw()
  }

  private collar: { values: Float32Array; from: number; to: number; colour: Color } | null = null
  private collarColours: BufferAttribute | null = null
  private static readonly SCAN_GREY = new Color(0xdedede)

  /**
   * Blends the surface toward `colour` as `values` (one per vertex) fall from `to` to `from`:
   * where the scan's cut crowns run into the standard gum, so the edge melts into it instead of
   * showing as a hard cut. Display only; null takes it off.
   */
  setCollar(values: Float32Array | null, from = 0, to = 1, colour = '#c99aa0') {
    this.collar = values ? { values, from, to, colour: new Color(colour) } : null
    this.refreshMaterial()
  }

  private collared(base: BufferAttribute | null, collar: NonNullable<ScanViewer['collar']>): BufferAttribute {
    const count = collar.values.length
    if (!this.collarColours || this.collarColours.count !== count) this.collarColours = new BufferAttribute(new Float32Array(count * 3), 3)
    const out = this.collarColours.array as Float32Array
    const source = base?.array as Float32Array | undefined
    const grey = ScanViewer.SCAN_GREY
    const { r, g, b } = collar.colour
    const span = collar.to - collar.from
    for (let v = 0; v < count; v++) {
      const br = source ? source[v * 3] : grey.r
      const bg = source ? source[v * 3 + 1] : grey.g
      const bb = source ? source[v * 3 + 2] : grey.b
      const t = (collar.values[v] - collar.from) / span
      const k = t >= 1 || !(t === t) ? 0 : t <= 0 ? 0.9 : 0.9 * (1 - t) * (1 - t)
      out[v * 3] = br + (r - br) * k
      out[v * 3 + 1] = bg + (g - bg) * k
      out[v * 3 + 2] = bb + (b - bb) * k
    }
    this.collarColours.needsUpdate = true
    return this.collarColours
  }

  /** The scan's points, in viewer coordinates (for working out which tooth each belongs to): never the display-only moves. */
  get positions(): Float32Array | null {
    return (this.filePositions?.array as Float32Array | undefined) ?? null
  }

  private filePositions: BufferAttribute | null = null
  private shownPositions: BufferAttribute | null = null

  /**
   * Draws some points a little moved (display only: the cut edge smoothed after hiding the gums);
   * null draws them where the file has them again.
   */
  setEdgeShift(shift: { indices: Uint32Array; positions: Float32Array } | null) {
    const geometry = this.geometry
    const base = this.filePositions
    if (!geometry || !base) return
    if (!shift) {
      if (geometry.getAttribute('position') !== base) {
        geometry.setAttribute('position', base)
        this.draw()
      }
      return
    }
    const source = base.array as Float32Array
    if (!this.shownPositions || this.shownPositions.count !== base.count) this.shownPositions = new BufferAttribute(new Float32Array(source.length), 3)
    const out = this.shownPositions.array as Float32Array
    out.set(source)
    for (let i = 0; i < shift.indices.length; i++) {
      const v = shift.indices[i] * 3
      out[v] = shift.positions[i * 3]
      out[v + 1] = shift.positions[i * 3 + 1]
      out[v + 2] = shift.positions[i * 3 + 2]
    }
    this.shownPositions.needsUpdate = true
    geometry.setAttribute('position', this.shownPositions)
    this.draw()
  }

  /**
   * Colours the surface tooth by tooth: `regions` gives each vertex's pin (or -1), `colours`
   * each pin's colour (CSS hex), and `rest` the colour of everything that belongs to no pin.
   * Null takes the shading off again.
   */
  setShading(regions: Int8Array | null, colours: string[], rest: string) {
    if (!this.geometry || !regions) {
      this.shading = null
      this.refreshMaterial()
      return
    }
    const count = regions.length
    const array = this.shading?.count === count ? (this.shading.array as Float32Array) : new Float32Array(count * 3)
    const palette = colours.map((hex) => new Color(hex))
    const base = new Color(rest)
    for (let v = 0; v < count; v++) {
      const c = regions[v] >= 0 ? palette[regions[v]] ?? base : base
      array[v * 3] = c.r
      array[v * 3 + 1] = c.g
      array[v * 3 + 2] = c.b
    }
    if (this.shading?.count === count) this.shading.needsUpdate = true
    else this.shading = new BufferAttribute(array, 3)
    this.refreshMaterial()
  }

  /** The scan's surface directions per vertex, in viewer coordinates. */
  get normals(): Float32Array | null {
    return (this.geometry?.getAttribute('normal').array as Float32Array | undefined) ?? null
  }

  /** The file's own vertex colours (linear RGB), or null when it has none. */
  get colors(): Float32Array | null {
    return (this.fileColors?.array as Float32Array | undefined) ?? null
  }

  /** The file's triangles as vertex numbers, or null when every three vertices are one triangle. */
  get triangleIndex(): Uint32Array | null {
    return (this.fullIndex?.array as Uint32Array | undefined) ?? null
  }

  /**
   * Draws only some of the triangles: `write` fills the array it is given with vertex numbers,
   * three per triangle, and returns how many it wrote. Null draws them all again. Only what is
   * drawn changes: the scan's points stay as they are. One buffer is reused for every change.
   */
  setVisibleTriangles(write: ((out: Uint32Array) => number) | null) {
    const geometry = this.geometry
    if (!geometry) return
    if (!write) {
      geometry.setIndex(this.fullIndex)
      geometry.setDrawRange(0, Infinity)
      this.draw()
      return
    }
    const size = this.fullIndex ? this.fullIndex.count : geometry.getAttribute('position').count - (geometry.getAttribute('position').count % 3)
    if (!this.visible || this.visible.count !== size) this.visible = new BufferAttribute(new Uint32Array(size), 1)
    const count = write(this.visible.array as Uint32Array)
    this.visible.clearUpdateRanges()
    this.visible.addUpdateRange(0, count)
    this.visible.needsUpdate = true
    geometry.setIndex(this.visible)
    geometry.setDrawRange(0, count)
    this.draw()
  }

  /**
   * Something drawn around the scan, like the standard skull (null takes it away). It is only
   * context: clicks still pick the scan alone.
   */
  setOverlay(object: Object3D | null) {
    if (this.overlay) this.scene.remove(this.overlay)
    this.overlay = object
    if (object) this.scene.add(object)
    // The skull is several times the scan's size: allow zooming out far enough to see it whole.
    this.controls.maxDistance = object ? 40 : 12
    this.camera.far = object ? 150 : 50
    this.camera.updateProjectionMatrix()
    this.draw()
  }

  /** Where Reset view goes; null is the default front view. */
  setHome(view: CameraState | null) {
    this.homeView = view
  }

  /** The point on the scan's surface under a spot on the screen, in viewer coordinates. */
  pick(clientX: number, clientY: number): Vec3 | null {
    if (!this.mesh) return null
    const rect = this.renderer.domElement.getBoundingClientRect()
    const ndc = new Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1)
    this.raycaster.setFromCamera(ndc, this.camera)
    const hit = this.raycaster.intersectObject(this.mesh, false)[0]
    return hit ? [hit.point.x, hit.point.y, hit.point.z] : null
  }

  /**
   * What is under a spot on the screen: the point on the scan (and how far along the ray), and
   * the nearest part of the overlay that names a tooth (a standard tooth around the scan).
   */
  pickAll(clientX: number, clientY: number): { scan: Vec3 | null; scanDistance: number; tooth: string | null; toothDistance: number } {
    const rect = this.renderer.domElement.getBoundingClientRect()
    const ndc = new Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1)
    this.raycaster.setFromCamera(ndc, this.camera)
    const hit = this.mesh ? this.raycaster.intersectObject(this.mesh, false)[0] : undefined
    const teeth: Object3D[] = []
    this.overlay?.traverse((object) => {
      if (object.userData.tooth) teeth.push(object)
    })
    const tooth = teeth.length > 0 ? this.raycaster.intersectObjects(teeth, false)[0] : undefined
    return {
      scan: hit ? [hit.point.x, hit.point.y, hit.point.z] : null,
      scanDistance: hit?.distance ?? Infinity,
      tooth: (tooth?.object.userData.tooth as string | undefined) ?? null,
      toothDistance: tooth?.distance ?? Infinity,
    }
  }

  /** Where a point is on the canvas, in pixels from its top left; null when it is behind the camera. */
  project(point: Vec3): { x: number; y: number } | null {
    const v = new Vector3(...point).project(this.camera)
    if (v.z > 1) return null
    return { x: ((v.x + 1) / 2) * this.container.clientWidth, y: ((1 - v.y) / 2) * this.container.clientHeight }
  }

  /** The canvas, for pointer events. */
  get canvas(): HTMLCanvasElement {
    return this.renderer.domElement
  }

  /** The pointer shown over the scan (a crosshair while marking teeth). */
  setCursor(cursor: string) {
    this.renderer.domElement.style.cursor = cursor
  }

  /** Turns the camera controls off while a pin is dragged. */
  setControlsEnabled(on: boolean) {
    this.controls.enabled = on
  }

  /** Told on every camera move, including resets and synced moves (for labels drawn over the canvas). */
  onViewChange(listener: () => void) {
    this.viewListeners.add(listener)
    return () => {
      this.viewListeners.delete(listener)
    }
  }

  resetView() {
    this.setCamera(
      this.homeView ?? {
        position: [this.home.position.x, this.home.position.y, this.home.position.z],
        target: [0, 0, 0],
        up: [0, 1, 0],
      },
    )
    this.listeners.forEach((listener) => listener())
  }

  getCamera(): CameraState {
    const { position, up } = this.camera
    const { target } = this.controls
    return { position: [position.x, position.y, position.z], target: [target.x, target.y, target.z], up: [up.x, up.y, up.z] }
  }

  /** Moves the camera without telling listeners, so two viewers can follow each other. */
  setCamera(state: CameraState) {
    this.quiet = true
    this.camera.position.set(...state.position)
    this.camera.up.set(...state.up)
    this.controls.target.set(...state.target)
    this.camera.lookAt(this.controls.target)
    this.quiet = false
    this.draw()
  }

  /** Told whenever the person moves the camera. Returns a function that stops listening. */
  onCameraChange(listener: () => void) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    cancelAnimationFrame(this.frame)
    cancelAnimationFrame(this.loop)
    this.renderer.domElement.removeEventListener('pointerdown', this.wake)
    this.renderer.domElement.removeEventListener('wheel', this.wake)
    this.observer.disconnect()
    this.listeners.clear()
    this.viewListeners.clear()
    this.controls.removeEventListener('change', this.onControls)
    this.controls.removeEventListener('start', this.onStart)
    this.controls.removeEventListener('end', this.onEnd)
    this.controls.dispose()
    this.renderer.domElement.removeEventListener('webglcontextlost', this.onLost)
    if (this.mesh) this.scene.remove(this.mesh)
    if (this.overlay) this.scene.remove(this.overlay)
    this.overlay = null
    this.fullIndex = null
    this.visible = null
    this.geometry?.dispose()
    this.shading = null
    this.collar = null
    this.collarColours = null
    this.fileColors = null
    this.material.dispose()
    this.renderer.dispose()
    // Browsers allow only a handful of 3D contexts at once: give this one back now.
    this.renderer.forceContextLoss()
    this.renderer.domElement.remove()
    this.mesh = null
    this.geometry = null
  }
}
