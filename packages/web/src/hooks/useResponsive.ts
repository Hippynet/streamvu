/**
 * Responsive & Touch Detection Hook
 *
 * Provides information about the current device capabilities
 * and viewport size for responsive layouts.
 */

import { useState, useEffect, useCallback } from 'react'

interface ResponsiveState {
  // Screen size breakpoints
  isMobile: boolean    // < 640px
  isTablet: boolean    // 640px - 1023px
  isDesktop: boolean   // >= 1024px
  isLargeDesktop: boolean // >= 1280px

  // Input type
  hasTouch: boolean
  hasMouse: boolean
  hasCoarsePointer: boolean // Touch-like device

  // Orientation
  isPortrait: boolean
  isLandscape: boolean

  // Safe areas (for notched devices)
  safeAreaInsets: {
    top: number
    right: number
    bottom: number
    left: number
  }

  // Viewport dimensions
  viewportWidth: number
  viewportHeight: number

  // Preference for reduced data usage
  prefersReducedData: boolean
}

// Breakpoint values
const BREAKPOINTS = {
  mobile: 640,
  tablet: 1024,
  desktop: 1280,
} as const

/**
 * Hook to detect responsive breakpoints and device capabilities
 */
export function useResponsive(): ResponsiveState {
  const [state, setState] = useState<ResponsiveState>(() => getInitialState())

  // Get initial state (SSR-safe)
  function getInitialState(): ResponsiveState {
    if (typeof window === 'undefined') {
      return {
        isMobile: false,
        isTablet: false,
        isDesktop: true,
        isLargeDesktop: false,
        hasTouch: false,
        hasMouse: true,
        hasCoarsePointer: false,
        isPortrait: false,
        isLandscape: true,
        safeAreaInsets: { top: 0, right: 0, bottom: 0, left: 0 },
        viewportWidth: 1280,
        viewportHeight: 720,
        prefersReducedData: false,
      }
    }

    return computeState()
  }

  // Compute current state from window/document
  const computeState = useCallback((): ResponsiveState => {
    const width = window.innerWidth
    const height = window.innerHeight

    // Detect touch capability
    const hasTouch = 'ontouchstart' in window ||
      navigator.maxTouchPoints > 0 ||
      // @ts-expect-error -- msMaxTouchPoints is IE-specific
      navigator.msMaxTouchPoints > 0

    // Detect pointer type
    const hasCoarsePointer = window.matchMedia('(pointer: coarse)').matches
    const hasMouse = window.matchMedia('(pointer: fine)').matches || !hasCoarsePointer

    // Detect orientation
    const isPortrait = height > width
    const isLandscape = width > height

    // Detect safe area insets (for notched devices)
    const safeAreaInsets = {
      top: parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sat') || '0', 10) || 0,
      right: parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sar') || '0', 10) || 0,
      bottom: parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sab') || '0', 10) || 0,
      left: parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sal') || '0', 10) || 0,
    }

    // Detect reduced data preference
    // @ts-expect-error -- connection is not fully typed
    const prefersReducedData = navigator.connection?.saveData === true

    return {
      isMobile: width < BREAKPOINTS.mobile,
      isTablet: width >= BREAKPOINTS.mobile && width < BREAKPOINTS.tablet,
      isDesktop: width >= BREAKPOINTS.tablet,
      isLargeDesktop: width >= BREAKPOINTS.desktop,
      hasTouch,
      hasMouse,
      hasCoarsePointer,
      isPortrait,
      isLandscape,
      safeAreaInsets,
      viewportWidth: width,
      viewportHeight: height,
      prefersReducedData,
    }
  }, [])

  useEffect(() => {
    // Update state on resize
    const handleResize = () => {
      setState(computeState())
    }

    // Update on orientation change
    const handleOrientationChange = () => {
      // Small delay to let the browser update dimensions
      setTimeout(handleResize, 100)
    }

    // Update on media query changes
    const touchQuery = window.matchMedia('(pointer: coarse)')
    const handleTouchChange = () => {
      setState(computeState())
    }

    window.addEventListener('resize', handleResize)
    window.addEventListener('orientationchange', handleOrientationChange)
    touchQuery.addEventListener('change', handleTouchChange)

    // Initial state
    setState(computeState())

    return () => {
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('orientationchange', handleOrientationChange)
      touchQuery.removeEventListener('change', handleTouchChange)
    }
  }, [computeState])

  return state
}

/**
 * Hook to detect if we're on a touch-only device
 */
export function useTouchDevice(): boolean {
  const { hasTouch, hasMouse } = useResponsive()
  return hasTouch && !hasMouse
}

/**
 * Hook to get current breakpoint name
 */
export function useBreakpoint(): 'mobile' | 'tablet' | 'desktop' | 'largeDesktop' {
  const { isMobile, isTablet, isLargeDesktop } = useResponsive()

  if (isMobile) return 'mobile'
  if (isTablet) return 'tablet'
  if (isLargeDesktop) return 'largeDesktop'
  return 'desktop'
}

/**
 * Hook to track viewport size changes
 */
export function useViewportSize(): { width: number; height: number } {
  const [size, setSize] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 1280,
    height: typeof window !== 'undefined' ? window.innerHeight : 720,
  })

  useEffect(() => {
    const handleResize = () => {
      setSize({
        width: window.innerWidth,
        height: window.innerHeight,
      })
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return size
}

/**
 * Hook to detect landscape mode on mobile
 */
export function useMobileLandscape(): boolean {
  const { isMobile, isTablet, isLandscape } = useResponsive()
  return (isMobile || isTablet) && isLandscape
}
