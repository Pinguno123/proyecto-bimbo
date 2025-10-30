import { useEffect, useMemo, useState } from 'react'
import './App.css'
import gatoCool from './assets/gatoCool.png'
import gatoCorazon from './assets/gatoCorazon.png'
import gatoDudoso from './assets/gatoDudoso.png'
import { supabase } from './lib/supabaseClient'
import * as Select from '@radix-ui/react-select'

const PASSWORD_COLUMN = 'contraseña_usuario'
const USER_STORAGE_KEY = 'diarioUsuario'
const IMGBB_API_KEY = import.meta.env.VITE_IMGBB_API_KEY ?? ''

const FEATURE_TABS = [
  { key: 'days', label: 'Días juntos' },
  { key: 'mood', label: 'Estado de ánimo' },
  { key: 'reminders', label: 'Recordatorio de pareja' },
  { key: 'gallery', label: 'Galería de recuerdos' },
  /* { key: 'photo', label: 'Cambiar foto de perfil' }, */
]

const getStartDateKey = (id) => `${USER_STORAGE_KEY}:startDate:${id}`

const HintModal = ({ onClose }) => (
  <div className="modal-backdrop" role="dialog" aria-modal="true">
    <div className="modal-card">
      <img
        src={gatoDudoso}
        alt="Gato dudoso ofreciendo la pista de la contrasena"
        className="modal-image"
      />
      <p className="modal-text">
        <strong>Pista:</strong> es el cumpleaños del otro.
      </p>
      <button type="button" className="secondary-button" onClick={onClose}>
        Cerrar
      </button>
    </div>
  </div>
)

const GalleryPreviewModal = ({ item, onClose }) => {
  const [isDownloading, setIsDownloading] = useState(false)
  const [downloadStatus, setDownloadStatus] = useState({ type: null, message: '' })

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  useEffect(() => {
    setIsDownloading(false)
    setDownloadStatus({ type: null, message: '' })
  }, [item])

  useEffect(() => {
    if (!downloadStatus.message) return
    const timer = setTimeout(() => {
      setDownloadStatus({ type: null, message: '' })
    }, 3000)
    return () => clearTimeout(timer)
  }, [downloadStatus])

  if (!item) return null

  const handleDownload = async () => {
    if (!item?.recurso_imagen || isDownloading) return
    setDownloadStatus({ type: null, message: '' })
    setIsDownloading(true)

    try {
      const response = await fetch(item.recurso_imagen, { mode: 'cors' })
      if (!response.ok) {
        throw new Error('No pudimos descargar la imagen.')
      }

      const blob = await response.blob()
      const objectUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')
      const baseName =
        (item.pie_imagen || `recuerdo-${item.id ?? Date.now()}`)
          .toString()
          .trim()
          .replace(/\s+/g, '-')
          .replace(/[^\w-]/g, '')
          .toLowerCase() || 'recuerdo'
      link.href = objectUrl
      link.download = `${baseName}.jpg`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(objectUrl)
      setDownloadStatus({ type: 'success', message: 'Descarga iniciada.' })
    } catch (error) {
      console.error('Download error:', error)
      setDownloadStatus({
        type: 'error',
        message: 'No pudimos descargar la imagen. Int\u00e9ntalo m\u00e1s tarde.',
      })
    } finally {
      setIsDownloading(false)
    }
  }

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="preview-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="preview-close"
          onClick={onClose}
          aria-label="Cerrar vista previa"
        >
          &times;
        </button>
        <div className="preview-image-wrapper">
          <a
            href={item.recurso_imagen}
            target="_blank"
            rel="noopener noreferrer"
            className="preview-image-link"
          >
            <img
              src={item.recurso_imagen}
              alt={item.pie_imagen || 'Recuerdo de la galeria'}
            />
          </a>
        </div>
        <div className="preview-details">
          <h4>{item.pie_imagen || 'Sin pie de foto'}</h4>
          <p className="meta">
            Subido por {item.usuarios?.nombre_usuario ?? 'Usuario'} -{' '}
            {new Date(item.created_at).toLocaleString()}
          </p>
          <p className="meta">Haz clic en la imagen para abrirla en una pestaña nueva.</p>
        </div>
        <div className="preview-actions">
          <button
            type="button"
            className="secondary-button preview-download"
            onClick={handleDownload}
            disabled={isDownloading}
          >
            Descargar
          </button>
          <button type="button" className="secondary-button" onClick={onClose}>
            Cerrar
          </button>
        </div>
        {downloadStatus.message ? (
          <p
            className={`photo-status ${downloadStatus.type === 'error' ? 'error' : 'success'
              }`}
            role="status"
          >
            {downloadStatus.message}
          </p>
        ) : null}
      </div>
    </div>
  )
}

const fileToBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('No se pudo leer el archivo'))
        return
      }
      const [, base64 = ''] = reader.result.split(',')
      resolve(base64)
    }
    reader.onerror = () => reject(reader.error ?? new Error('Error al leer el archivo'))
    reader.readAsDataURL(file)
  })

function App() {
  const [view, setView] = useState('welcome')
  const [showHint, setShowHint] = useState(false)
  const [formValues, setFormValues] = useState({ username: '', password: '' })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [userData, setUserData] = useState(null)

  const [activeFeature, setActiveFeature] = useState(FEATURE_TABS[0].key)
  const [startDate, setStartDate] = useState('')
  const [moodForm, setMoodForm] = useState({ value: '', note: '' })
  const [moodEntries, setMoodEntries] = useState([])
  const [reminders, setReminders] = useState([])
  const [galleryItems, setGalleryItems] = useState([])
  const [galleryForm, setGalleryForm] = useState({ caption: '', file: null })
  const [galleryStatus, setGalleryStatus] = useState({ type: null, message: '' })
  const [isUploadingGallery, setIsUploadingGallery] = useState(false)
  const [previewItem, setPreviewItem] = useState(null)

  const [photoUrlInput, setPhotoUrlInput] = useState('')
  const [photoStatus, setPhotoStatus] = useState({ type: null, message: '' })
  const [isUpdatingPhoto, setIsUpdatingPhoto] = useState(false)

  const [contentLoading, setContentLoading] = useState(false)
  const [contentError, setContentError] = useState('')

  const usernameIsValid = formValues.username.trim().length > 0
  const passwordIsValid = formValues.password.trim().length > 0
  const formIsValid = usernameIsValid && passwordIsValid

  useEffect(() => {
    if (typeof window === 'undefined') return
    const storedValue = window.localStorage.getItem(USER_STORAGE_KEY)
    if (!storedValue) return

    try {
      const parsed = JSON.parse(storedValue)
      if (parsed && typeof parsed === 'object') {
        setUserData(parsed)
        setView('profile')
      }
    } catch {
      window.localStorage.removeItem(USER_STORAGE_KEY)
    }
  }, [])

  useEffect(() => {
    if (!userData) {
      setActiveFeature(FEATURE_TABS[0].key)
      setMoodEntries([])
      setReminders([])
      setGalleryItems([])
      setMoodForm({ value: '', note: '' })
      setStartDate('')
      setPhotoUrlInput('')
      setPhotoStatus({ type: null, message: '' })
      return
    }

    setActiveFeature(FEATURE_TABS[0].key)
    setPhotoUrlInput(userData.recurso_img ?? '')

    if (typeof window !== 'undefined') {
      const storedStart = window.localStorage.getItem(getStartDateKey(userData.id))
      setStartDate(storedStart ?? '')
    }

    const fetchContent = async () => {
      setContentLoading(true)
      setContentError('')
      try {
        const [estadoRes, recordatoriosRes, galeriaRes] = await Promise.all([
          supabase
            .from('estado')
            .select('id, estado_animo, motivo, created_at, id_usuario, usuarios ( nombre_usuario )')
            .order('created_at', { ascending: false }),
          supabase
            .from('recordatorios')
            .select('id, recordatorio, created_at, id_usuario, usuarios ( nombre_usuario )')
            .order('created_at', { ascending: false }),
          supabase
            .from('galeria')
            .select('id, recurso_imagen, pie_imagen, created_at, id_usuario, usuarios ( nombre_usuario )')
            .order('created_at', { ascending: false }),
        ])

        if (estadoRes.error) throw estadoRes.error
        if (recordatoriosRes.error) throw recordatoriosRes.error
        if (galeriaRes.error) throw galeriaRes.error

        const estados = estadoRes.data ?? []
        setMoodEntries(estados)
        const lastSelfMood = estados.find((item) => item.id_usuario === userData.id)
        if (lastSelfMood) {
          setMoodForm({
            value: lastSelfMood.estado_animo ?? '',
            note: lastSelfMood.motivo ?? '',
          })
        } else {
          setMoodForm({ value: '', note: '' })
        }

        setReminders(recordatoriosRes.data ?? [])
        setGalleryItems(galeriaRes.data ?? [])
      } catch (error) {
        console.error('Error al cargar datos del usuario:', error)
        setContentError(
          'No pudimos cargar toda la información. Intenta refrescar la sesión.',
        )
      } finally {
        setContentLoading(false)
      }
    }

    fetchContent()
  }, [userData])

  useEffect(() => {
    if (!userData) return
    if (typeof window === 'undefined') return
    if (startDate) {
      window.localStorage.setItem(getStartDateKey(userData.id), startDate)
    } else {
      window.localStorage.removeItem(getStartDateKey(userData.id))
    }
  }, [startDate, userData])

  const handleContinue = () => {
    setView('login')
  }

  const handleLogout = () => {
    setView('welcome')
    setUserData(null)
    setFormValues({ username: '', password: '' })
    setActiveFeature(FEATURE_TABS[0].key)
    setMoodEntries([])
    setReminders([])
    setGalleryItems([])
    setMoodForm({ value: '', note: '' })
    setGalleryForm({ caption: '', file: null })
    setGalleryStatus({ type: null, message: '' })
    setStartDate('')
    setPhotoUrlInput('')
    setPhotoStatus({ type: null, message: '' })
    setContentError('')

    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(USER_STORAGE_KEY)
    }
  }

  const handleChange = (event) => {
    const { name, value } = event.target
    setFormValues((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!formIsValid || isSubmitting) return

    setIsSubmitting(true)
    setErrorMessage('')

    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(USER_STORAGE_KEY)
    }

    const username = formValues.username.trim()
    const password = formValues.password.trim()

    try {
      const { data, error } = await supabase
        .from('usuarios')
        .select('id, nombre_usuario, recurso_img')
        .eq('nombre_usuario', username)
        .eq(PASSWORD_COLUMN, password)
        .maybeSingle()

      if (error && error.code !== 'PGRST116') {
        throw error
      }

      if (!data) {
        setErrorMessage('Las credenciales ingresadas no son correctas.')
        return
      }

      setUserData(data)
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(data))
      }
      setView('profile')
    } catch (error) {
      console.error('Supabase error:', error)
      setErrorMessage('No pudimos verificar tus datos. Intenta de nuevo.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleStartDateChange = (value) => {
    setStartDate(value)
    if (userData && typeof window !== 'undefined') {
      if (value) {
        window.localStorage.setItem(getStartDateKey(userData.id), value)
      } else {
        window.localStorage.removeItem(getStartDateKey(userData.id))
      }
    }
  }

  const handleMoodValueChange = (newValue) => {
  setMoodForm((prev) => ({ ...prev, value: newValue }))
}

const handleMoodFieldChange = (event) => {
    const { name, value } = event.target
    setMoodForm((prev) => ({ ...prev, [name]: value }))
  }

const handleMoodSubmit = async (event) => {
  event.preventDefault()
  if (!userData) return
  if (!moodForm.value.trim() && !moodForm.note.trim()) return

    try {
      const { data, error } = await supabase
        .from('estado')
        .insert({
          id_usuario: userData.id,
          estado_animo: moodForm.value.trim(),
          motivo: moodForm.note.trim(),
        })
        .select('id, estado_animo, motivo, created_at, id_usuario, usuarios ( nombre_usuario )')
        .single()

      if (error) {
        throw error
      }

      const enriched = {
        ...data,
        usuarios: data.usuarios ?? { nombre_usuario: userData.nombre_usuario },
        id_usuario: data.id_usuario ?? userData.id,
      }
      setMoodEntries((prev) => [enriched, ...prev])
      setMoodForm({ value: '', note: '' })
      setContentError('')
    } catch (error) {
      console.error('Error al registrar estado de ánimo:', error)
      setContentError('No se pudo guardar el estado de ánimo.')
    }
  }

  const handleAddReminder = async (event) => {
    event.preventDefault()
    const formElement = event.currentTarget
    if (!userData) return

    const formData = new FormData(formElement)
    const reminderText = formData.get('reminder')?.toString().trim()
    if (!reminderText) return

    try {
      const { data, error } = await supabase
        .from('recordatorios')
        .insert({
          id_usuario: userData.id,
          recordatorio: reminderText,
        })
        .select('id, recordatorio, created_at, id_usuario, usuarios ( nombre_usuario )')
        .single()

      if (error) {
        throw error
      }

      const enriched = {
        ...data,
        usuarios: data.usuarios ?? { nombre_usuario: userData.nombre_usuario },
        id_usuario: data.id_usuario ?? userData.id,
      }
      setReminders((prev) => [enriched, ...prev])
      if (formElement) {
        formElement.reset()
      }
      setContentError('')
    } catch (error) {
      console.error('Error al guardar recordatorio:', error)
      setContentError('No se pudo guardar el recordatorio.')
    }
  }

  const handleRemoveReminder = async (id) => {
    if (!userData) return

    try {
      const { error } = await supabase
        .from('recordatorios')
        .delete()
        .eq('id', id)
        .eq('id_usuario', userData.id)

      if (error) throw error

      setReminders((prev) => prev.filter((item) => item.id !== id))
    } catch (error) {
      console.error('Error al eliminar recordatorio:', error)
      setContentError('No se pudo eliminar el recordatorio.')
    }
  }

  const handleGalleryFieldChange = (event) => {
    const { name, value, files } = event.target
    if (name === 'file') {
      setGalleryForm((prev) => ({ ...prev, file: files?.[0] ?? null }))
    } else {
      setGalleryForm((prev) => ({ ...prev, [name]: value }))
    }
  }

  const handleGalleryUpload = async (event) => {
    event.preventDefault()
    const formElement = event.currentTarget
    if (!userData) return
    if (!galleryForm.file) {
      setGalleryStatus({ type: 'error', message: 'Selecciona una imagen.' })
      return
    }
    if (!IMGBB_API_KEY) {
      setGalleryStatus({
        type: 'error',
        message: 'Configura VITE_IMGBB_API_KEY para subir imágenes.',
      })
      return
    }

    setIsUploadingGallery(true)
    setGalleryStatus({ type: null, message: '' })

    try {
      const base64 = await fileToBase64(galleryForm.file)
      const body = new FormData()
      body.append('image', base64)
      body.append('name', galleryForm.file.name.replace(/\.[^.]+$/, ''))

      const response = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
        method: 'POST',
        body,
      })

      const json = await response.json()
      if (!response.ok || !json?.success) {
        throw new Error(json?.error?.message ?? 'Error al subir la imagen a Imgbb.')
      }

      const imageUrl = json.data?.url
      if (!imageUrl) {
        throw new Error('Imgbb no devolvió una URL de imagen.')
      }

      const { data, error } = await supabase
        .from('galeria')
        .insert({
          id_usuario: userData.id,
          recurso_imagen: imageUrl,
          pie_imagen: galleryForm.caption.trim(),
        })
        .select('id, recurso_imagen, pie_imagen, created_at, id_usuario, usuarios ( nombre_usuario )')
        .single()

      if (error) throw error

      const enriched = {
        ...data,
        usuarios: data.usuarios ?? { nombre_usuario: userData.nombre_usuario },
        id_usuario: data.id_usuario ?? userData.id,
      }
      setGalleryItems((prev) => [enriched, ...prev])
      setGalleryForm({ caption: '', file: null })
      setGalleryStatus({
        type: 'success',
        message: 'Imagen subida y guardada exitosamente.',
      })
      if (formElement) {
        formElement.reset()
      }
    } catch (error) {
      console.error('Error al subir imagen:', error)
      setGalleryStatus({
        type: 'error',
        message: error.message ?? 'No se pudo guardar la imagen.',
      })
    } finally {
      setIsUploadingGallery(false)
    }
  }

  const handleDeleteGalleryItem = async (id) => {
    if (!userData) return

    try {
      const { error } = await supabase
        .from('galeria')
        .delete()
        .eq('id', id)
        .eq('id_usuario', userData.id)

      if (error) throw error

      setGalleryItems((prev) => prev.filter((item) => item.id !== id))
    } catch (error) {
      console.error('Error al eliminar imagen:', error)
      setGalleryStatus({
        type: 'error',
        message: 'No se pudo eliminar la imagen.',
      })
    }
  }

  const handleUpdatePhoto = async (event) => {
    event.preventDefault()
    if (!userData || !photoUrlInput.trim() || isUpdatingPhoto) return

    setIsUpdatingPhoto(true)
    setPhotoStatus({ type: null, message: '' })

    try {
      const { data, error } = await supabase
        .from('usuarios')
        .update({ recurso_img: photoUrlInput.trim() })
        .eq('id', userData.id)
        .select('id, nombre_usuario, recurso_img')
        .single()

      if (error) throw error

      setUserData(data)
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(data))
      }
      setPhotoStatus({ type: 'success', message: 'Foto actualizada con éxito.' })
    } catch (error) {
      console.error('Error al actualizar foto:', error)
      setPhotoStatus({
        type: 'error',
        message: 'No pudimos actualizar la imagen. Intenta más tarde.',
      })
    } finally {
      setIsUpdatingPhoto(false)
    }
  }

  const daysTogether = useMemo(() => {
    if (!startDate) return null
    const start = new Date(startDate)
    if (Number.isNaN(start.getTime())) return null
    const now = new Date()
    const diff = Math.floor((now - start) / 86400000)
    return diff >= 0 ? diff : null
  }, [startDate])

  const welcomeContent = (
    <>
      <main className="welcome-hero">
        <img
          src={gatoCool}
          alt="Gato cool"
          width={200}
          style={{ marginLeft: 120 }}
        />
        <img
          src={gatoCorazon}
          alt="Gato corazon"
          width={200}
          style={{ marginRight: 120 }}
        />
        <h1>Bienvenido/a a nuestro diario</h1>
        <p>
          Podrás expresar lo que pienses, mostrar tu estado de ánimo y
          guardar recuerdos juntos.
        </p>
      </main>

      <footer className="login-actions">
        <button type="button" className="primary-button" onClick={handleContinue}>
          Continuar
        </button>
        <div className="progress-bar" aria-hidden="true">
          <span />
        </div>
      </footer>
    </>
  )

  const [show, setShow] = useState(false);

  function handlePasswordChange(e) {
    let v = e.target.value.replace(/\D/g, "");   // solo dígitos
    if (v.length > 8) v = v.slice(0, 8);         // máx 8 dígitos

    let out = v;
    if (v.length >= 5) out = `${v.slice(0, 2)}-${v.slice(2, 4)}-${v.slice(4)}`; // dd-mm-aaaa
    else if (v.length >= 3) out = `${v.slice(0, 2)}-${v.slice(2)}`;

    setFormValues(prev => ({ ...prev, password: out }));
  }

  const loginContent = (
    <>
      <header className="login-header">
        <img
          src={gatoCool}
          alt="Gato cool"
          width={200}
          style={{ marginLeft: 120 }}
        />
        <img
          src={gatoCorazon}
          alt="Gato corazon"
          width={200}
          style={{ marginRight: 120 }}
        />
        <div>
          <h2>Inicia sesión</h2>
          <p>Retoma tus recuerdos o agrega nuevos.</p>
        </div>
      </header>

      <form className="login-form" onSubmit={handleSubmit}>
        <label htmlFor="username">Nombre de usuario</label>
        <input
          id="username"
          name="username"
          type="text"
          autoComplete="username"
          placeholder="Ingresa tu nombre"
          value={formValues.username}
          onChange={handleChange}
          required={true}
        />

        <label htmlFor="password">Contraseña</label>
        <input
          id="password"
          name="password"
          type={show ? "text" : "password"}
          inputMode="numeric"
          placeholder="Ingresa tu clave secreta"
          minLength={10}
          maxLength={10}
          value={formValues.password}
          onChange={handlePasswordChange}
          onFocus={() => setShow(true)}
          onBlur={() => setShow(false)}
          autoComplete="current-password"
          required={true}
        />


        {errorMessage ? (
          <p className="form-error" role="alert">
            {errorMessage}
          </p>
        ) : null}

        <button
          type="submit"
          className="primary-button"
          disabled={!formIsValid || isSubmitting}
        >
          {isSubmitting ? 'Validando...' : 'Entrar'}
        </button>
      </form>

      <button type="button" className="link-button" onClick={() => setShowHint(true)}>
        ¿Cuál es la contraseña?
      </button>
    </>
  )

  return (
    <div className="login-screen">
      {view === 'welcome' && welcomeContent}
      {view === 'login' && loginContent}

      {view === 'profile' && userData ? (
        <div className="profile-view">
          <section className="profile-card">
            <div className="profile-hero">
              <div>
                <h2>Hola, {userData.nombre_usuario}</h2>
                <p>Ya estás listo para continuar con tu aventura compartida.</p>
              </div>
            </div>

            {userData.recurso_img ? (
              <div className="profile-avatar">
                <img src={userData.recurso_img} alt="Avatar del usuario" />
              </div>
            ) : (
              <div className="profile-avatar placeholder">
                <span>Sin foto</span>
              </div>
            )}

            <div className="profile-details">
              <button type="button" className="logout-button" onClick={handleLogout}>
                Cerrar sesion
              </button>
            </div>
          </section>

          <nav className="feature-tabs" aria-label="Funciones disponibles">
            {FEATURE_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                className={`feature-button ${activeFeature === tab.key ? 'active' : ''}`}
                onClick={() => {
                  setActiveFeature(tab.key)
                  setPhotoStatus({ type: null, message: '' })
                  setGalleryStatus({ type: null, message: '' })
                }}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          {contentLoading ? <p className="feature-hint">Cargando información...</p> : null}
          {contentError ? (
            <p className="feature-error" role="alert">
              {contentError}
            </p>
          ) : null}

          <section className="feature-panel">
            {activeFeature === 'days' ? (
              <div className="feature-section">
                <h3>Días juntos</h3>
                <p>
                  Ingresa la fecha en que comenzó su aventura para llevar un recuento
                  especial. Este dato se guarda en este dispositivo.
                </p>
                <label htmlFor="startDate" className="field-label">
                  Fecha de inicio
                </label>
                <input
                  id="startDate"
                  type="date"
                  value={startDate}
                  onChange={(event) => handleStartDateChange(event.target.value)}
                  className="field-input"
                  required={true}
                />
                {daysTogether !== null ? (
                  <div className="highlight-card" role="status">
                    <span className="highlight-number">{daysTogether}</span>
                    <span>Días celebrando juntos</span>
                  </div>
                ) : (
                  <p className="feature-hint">
                    Aún no se muestra ningún cálculo. Selecciona una fecha para
                    comenzar.
                  </p>
                )}
              </div>
            ) : null}

            {activeFeature === 'mood' ? (
              <div className="feature-section">
                <h3>Estado de ánimo</h3>
                <p>
                  Registra cómo se sienten hoy.
                </p>
                <form className="mood-form" onSubmit={handleMoodSubmit}>
                  <label htmlFor="moodValue" className="field-label">
                    Selecciona un estado
                  </label>
                  <MoodSelect id="moodValue" value={moodForm.value} onChange={handleMoodValueChange} />

                  <label htmlFor="moodNote" className="field-label">
                    Nota del momento
                  </label>
                  <textarea
                    id="moodNote"
                    name="note"
                    rows={3}
                    className="field-input"
                    placeholder="Escriban algo significativo del día..."
                    value={moodForm.note}
                    onChange={handleMoodFieldChange}
                  />

                  <button type="submit" className="secondary-button">
                    Guardar estado
                  </button>
                </form>

                {moodEntries.length ? (
                  <ul className="entry-list">
                    {moodEntries.map((item) => (
                      <li key={item.id} className="entry-card mood-entry">
                        <div>
                          <strong>{item.estado_animo || 'Sin estado'}</strong>
                          <p className="meta">
                            Por {item.usuarios?.nombre_usuario ?? 'Usuario'}
                          </p>
                          {item.motivo ? <p>{item.motivo}</p> : null}
                        </div>
                        <span className="meta">
                          {new Date(item.created_at).toLocaleString()}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="feature-hint">
                    Todavía no hay estados guardados. Completa el formulario para
                    registrar el primero.
                  </p>
                )}
              </div>
            ) : null}

            {activeFeature === 'reminders' ? (
              <div className="feature-section">
                <h3>Recordatorio de pareja</h3>
                <p>
                  Guarda actividades o detalles importantes, cada nota importa!
                </p>
                <form className="inline-form" onSubmit={handleAddReminder}>
                  <input
                    type="text"
                    name="reminder"
                    className="field-input"
                    placeholder="Planear cine, comprar flores..."
                    required={true}
                  />
                  <button type="submit" className="secondary-button">
                    Guardar
                  </button>
                </form>

                {reminders.length ? (
                  <ul className="entry-list">
                    {reminders.map((item) => (
                      <li key={item.id} className="entry-card">
                        <div>
                          <span>{item.recordatorio}</span>
                          <p className="meta">
                            Por {item.usuarios?.nombre_usuario ?? 'Usuario'}
                          </p>
                          <p className="meta">
                            {new Date(item.created_at).toLocaleString()}
                          </p>
                        </div>
                        <button
                          type="button"
                          className="remove-button"
                          onClick={() => handleRemoveReminder(item.id)}
                        >
                          Quitar
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="feature-hint">
                    No hay recordatorios guardados. Agrega el primero para comenzar.
                  </p>
                )}
              </div>
            ) : null}

            {activeFeature === 'gallery' ? (
              <div className="feature-section">
                <h3>Galería de recuerdos</h3>
                <p>
                  Nuestros recuerdos guardados para la eternidad.
                </p>
                <form className="gallery-form" onSubmit={handleGalleryUpload}>
                  <label htmlFor="galleryCaption" className="field-label">
                    Descripción
                  </label>
                  <input
                    id="galleryCaption"
                    name="caption"
                    type="text"
                    maxLength={120}
                    className="field-input"
                    placeholder="Descripción breve"
                    value={galleryForm.caption}
                    onChange={handleGalleryFieldChange}
                    required={true}
                  />

                  <label htmlFor="galleryFile" className="field-label">
                    Imagen
                  </label>
                  <div className="file-upload">
                    <label htmlFor="galleryFile" className="file-upload__button">
                      <span>Seleccionar imagen</span>
                    </label>
                    <input
                      id="galleryFile"
                      name="file"
                      type="file"
                      accept="image/*"
                      className="file-upload__input"
                      onChange={handleGalleryFieldChange}
                      required={true}
                    />
                    <p className="file-upload__hint">Archivos JPG o PNG (máx. 5MB)</p>
                    {galleryForm.file ? (
                      <p className="file-upload__filename" title={galleryForm.file.name}>
                        {galleryForm.file.name}
                      </p>
                    ) : null}
                  </div>

                  <button
                    type="submit"
                    className="primary-button"
                    disabled={isUploadingGallery}
                  >
                    {isUploadingGallery ? 'Subiendo...' : 'Subir y guardar'}
                  </button>
                </form>

                {galleryStatus.message ? (
                  <p
                    className={`feature-status ${galleryStatus.type === 'error' ? 'error' : 'success'}`}
                    role="status"
                  >
                    {galleryStatus.message}
                  </p>
                ) : null}

                {galleryItems.length ? (
                  <div className="gallery-grid">
                    {galleryItems.map((item) => (
                      <article key={item.id} className="gallery-card">
                        <button
                          type="button"
                          className="gallery-card__preview"
                          onClick={() => setPreviewItem(item)}
                          aria-label={`Ver imagen ${item.pie_imagen || 'sin pie de foto'} en grande`}
                        >
                          <img
                            src={item.recurso_imagen}
                            alt={item.pie_imagen || 'Recuerdo'}
                          />
                        </button>
                        <div>
                          <strong>{item.pie_imagen || 'Sin pie de foto'}</strong>
                          <p className="meta">
                            Subido por {item.usuarios?.nombre_usuario ?? 'Usuario'}
                          </p>
                          <p className="meta">
                            {new Date(item.created_at).toLocaleString()}
                          </p>
                        </div>
                        <div className="gallery-card__actions">
                          <button
                            type="button"
                            className="remove-button"
                            onClick={() => handleDeleteGalleryItem(item.id)}
                          >
                            Quitar
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="feature-hint">
                    Todavía no hay imágenes guardadas. Sube la primera para comenzar.
                  </p>
                )}
              </div>
            ) : null}

            {activeFeature === 'photo' ? (
              <div className="feature-section">
                <h3>Cambiar foto de perfil</h3>
                <p>
                  Actualiza la imagen guardada en la tabla <code>usuarios</code> usando una
                  URL remota.
                </p>
                <form className="photo-form" onSubmit={handleUpdatePhoto}>
                  <label htmlFor="photoUrl" className="field-label">
                    Nueva URL de foto
                  </label>
                  <input
                    id="photoUrl"
                    type="url"
                    className="field-input"
                    placeholder="https://..."
                    value={photoUrlInput}
                    onChange={(event) => setPhotoUrlInput(event.target.value)}
                    required
                  />
                  <button
                    type="submit"
                    className="primary-button"
                    disabled={isUpdatingPhoto || !photoUrlInput.trim()}
                  >
                    {isUpdatingPhoto ? 'Guardando...' : 'Actualizar foto'}
                  </button>
                </form>

                {photoStatus.message ? (
                  <p
                    className={`photo-status ${photoStatus.type === 'error' ? 'error' : 'success'}`}
                    role="status"
                  >
                    {photoStatus.message}
                  </p>
                ) : null}
              </div>
            ) : null}
          </section>
        </div>
      ) : null}

      {showHint ? <HintModal onClose={() => setShowHint(false)} /> : null}
      {previewItem ? (
        <GalleryPreviewModal item={previewItem} onClose={() => setPreviewItem(null)} />
      ) : null}
    </div>
  )
}

export default App
const moodOptions = [
  { value: 'feliz', label: 'Feliz' },
  { value: 'agradecidos', label: 'Agradecidos' },
  { value: 'enamorados', label: 'Muy enamorados' },
  { value: 'nostalgicos', label: 'Nostalgicos' },
  { value: 'creativos', label: 'Creativos' },
]

const MoodSelect = ({ id, value, onChange }) => (
  <Select.Root value={value} onValueChange={onChange}>
    <Select.Trigger
      id={id}
      className="select-trigger field-input field-select"
      aria-label="Estado de ánimo"
    >
      <Select.Value className="select-value" placeholder="Selecciona..." />
      <Select.Icon className="select-icon">
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <polyline
            points="6 9 12 15 18 9"
            fill="none"
            stroke="#6a3b23"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </Select.Icon>
    </Select.Trigger>

    <Select.Portal>
      <Select.Content className="select-content" position="popper" sideOffset={8}>
        <Select.Viewport className="select-viewport">
          {moodOptions.map((option) => (
            <Select.Item key={option.value} value={option.value} className="select-item">
              <Select.ItemIndicator className="select-item-indicator">
                <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                  <polyline
                    points="5 13 9 17 19 7"
                    fill="none"
                    stroke="#6a3b23"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </Select.ItemIndicator>
              <Select.ItemText>{option.label}</Select.ItemText>
            </Select.Item>
          ))}
        </Select.Viewport>
      </Select.Content>
    </Select.Portal>
  </Select.Root>
)







