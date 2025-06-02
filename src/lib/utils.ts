import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Format file size
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes'
  
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

// Format date
export function formatDate(date: Date | string | number): string {
  const d = date instanceof Date ? date : typeof date === 'number' ? new Date(date) : new Date(date)
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

// Format date with time
export function formatDateTime(date: Date | string | number): string {
  const d = date instanceof Date ? date : typeof date === 'number' ? new Date(date) : new Date(date)
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// Get relative time (e.g., "2 hours ago")
export function getRelativeTime(date: Date | string | number): string {
  const d = date instanceof Date ? date : typeof date === 'number' ? new Date(date) : new Date(date)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffSecs = Math.floor(diffMs / 1000)
  const diffMins = Math.floor(diffSecs / 60)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffSecs < 60) return 'Just now'
  if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`
  if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`
  if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`
  
  return formatDate(d)
}

// Debounce function
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null
  
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout)
    timeout = setTimeout(() => func(...args), wait)
  }
}

// Throttle function
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false
  
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args)
      inThrottle = true
      setTimeout(() => (inThrottle = false), limit)
    }
  }
}

// Generate random ID
export function generateId(prefix?: string): string {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).substring(2)
  return prefix ? `${prefix}_${timestamp}_${random}` : `${timestamp}_${random}`
}

// Validate email
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

// Capitalize first letter
export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

// Convert string to slug
export function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// Truncate text
export function truncate(str: string, length: number): string {
  if (str.length <= length) return str
  return str.substring(0, length) + '...'
}

// Get file extension
export function getFileExtension(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() || ''
}

// Check if file is image
export function isImageFile(mimeType: string): boolean {
  return mimeType.startsWith('image/')
}

// Check if file is document
export function isDocumentFile(mimeType: string): boolean {
  return mimeType === 'application/pdf' || 
         mimeType.includes('dwg') || 
         mimeType.includes('dxf')
}

// Generate color from string (for avatars, tags, etc.)
export function stringToColor(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }
  
  const hue = hash % 360
  return `hsl(${hue}, 70%, 50%)`
}

// Get initials from name
export function getInitials(name: string): string {
  return name
    .split(' ')
    .map(part => part.charAt(0))
    .join('')
    .toUpperCase()
    .substring(0, 2)
}

// Copy text to clipboard
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch (error) {
    // Fallback for browsers without clipboard API
    const textArea = document.createElement('textarea')
    textArea.value = text
    document.body.appendChild(textArea)
    textArea.select()
    document.execCommand('copy')
    document.body.removeChild(textArea)
    return true
  }
}

// Download file from URL
export function downloadFile(url: string, filename: string): void {
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.target = '_blank'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

// Parse search query into terms and filters
export function parseSearchQuery(query: string): {
  terms: string[]
  filters: Record<string, string>
} {
  const terms: string[] = []
  const filters: Record<string, string> = {}
  
  // Split by spaces, handling quoted strings
  const parts = query.match(/(?:[^\s"]+|"[^"]*")+/g) || []
  
  for (const part of parts) {
    if (part.includes(':')) {
      const [key, value] = part.split(':', 2)
      if (key && value) {
        filters[key.toLowerCase()] = value.replace(/"/g, '')
      }
    } else {
      terms.push(part.replace(/"/g, ''))
    }
  }
  
  return { terms, filters }
}

// Validate file upload
export function validateFileUpload(file: File): {
  valid: boolean
  error?: string
} {
  const maxSize = 100 * 1024 * 1024 // 100MB
  const allowedTypes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/bmp',
    'image/tiff',
    'application/pdf',
    'application/x-autocad',
    'application/dwg',
    'application/dxf',
    'image/vnd.dwg',
    'image/x-dwg',
  ]

  if (file.size > maxSize) {
    return {
      valid: false,
      error: `File size exceeds maximum limit of ${formatFileSize(maxSize)}`,
    }
  }

  if (!allowedTypes.includes(file.type)) {
    return {
      valid: false,
      error: `File type ${file.type} is not supported`,
    }
  }

  return { valid: true }
}

// Calculate upload progress
export function calculateProgress(loaded: number, total: number): number {
  return Math.round((loaded / total) * 100)
}

// Format duration (for analytics)
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${(ms / 60000).toFixed(1)}m`
}

// Check if string contains search terms
export function matchesSearchTerms(text: string, terms: string[]): boolean {
  const lowerText = text.toLowerCase()
  return terms.every(term => lowerText.includes(term.toLowerCase()))
}

// Sort array by multiple criteria
export function sortBy<T>(
  array: T[],
  criteria: Array<{
    key: keyof T | ((item: T) => any)
    direction: 'asc' | 'desc'
  }>
): T[] {
  return array.sort((a, b) => {
    for (const criterion of criteria) {
      const aVal = typeof criterion.key === 'function' 
        ? criterion.key(a) 
        : a[criterion.key]
      const bVal = typeof criterion.key === 'function' 
        ? criterion.key(b) 
        : b[criterion.key]
      
      let comparison = 0
      if (aVal < bVal) comparison = -1
      if (aVal > bVal) comparison = 1
      
      if (comparison !== 0) {
        return criterion.direction === 'desc' ? -comparison : comparison
      }
    }
    return 0
  })
}

// Group array by key
export function groupBy<T>(
  array: T[],
  keyFn: (item: T) => string
): Record<string, T[]> {
  return array.reduce((groups, item) => {
    const key = keyFn(item)
    groups[key] = groups[key] || []
    groups[key].push(item)
    return groups
  }, {} as Record<string, T[]>)
}

// Safe JSON parse
export function safeJsonParse<T>(str: string, fallback: T): T {
  try {
    return JSON.parse(str)
  } catch {
    return fallback
  }
}

// Format number with commas
export function formatNumber(num: number): string {
  return num.toLocaleString()
}

// Check if device is mobile
export function isMobile(): boolean {
  return typeof window !== 'undefined' && window.innerWidth < 768
}

// Retry function with exponential backoff
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error
  
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error as Error
      
      if (i === maxRetries) {
        throw lastError
      }
      
      const delay = baseDelay * Math.pow(2, i)
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }
  
  throw lastError!
}

// Format file category labels
export function formatCategoryLabel(category: string): string {
  switch (category) {
    case 'plans':
      return 'Plans';
    case 'work_drawings':
      return 'Work Drawings';
    case '3d':
      return '3D';
    case 'wip':
      return 'WIP';
    case 'finished':
      return 'Finished';
    default:
      // Fallback: capitalize words
      return category.split('_').map(capitalize).join(' ');
  }
}