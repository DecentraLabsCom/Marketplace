import React, { useState, useEffect } from 'react'
import { z } from 'zod'
import ReactFlagsSelect from 'react-flags-select'
import { useUser } from '@/context/UserContext'
import AccessControl from '@/components/auth/AccessControl'
import { Container, Input, Button } from '@/components/ui'
import devLog from '@/utils/dev/logger'

const providerSchema = z.object({
  name: z.string().min(1, 'Provider name is required'),
  email: z.string().min(1, 'Email is required').email('Invalid email address'),
  wallet: z.string().min(1, 'Wallet address is required').refine(
    (val) => /^0x[a-fA-F0-9]{40}$/.test(val),
    'Wallet address must start with 0x followed by 40 alphanumeric characters'
  ),
  country: z.string().min(2, 'Country is required'),
});

/**
 * Form for manual provider registration (non-SSO flow)
 * Collects provider details and submits to backend for validation and registration
 * @returns {JSX.Element} Provider registration form with validation and submission handling
 */
export default function ProviderRegisterForm() {
  const { user, isSSO, isProvider, address, isLoading } = useUser()
  const [formData, setFormData] = useState({ name: '', email: '', wallet: '', country: '' })
  const [errors, setErrors] = useState({})
  const [isSuccess, setIsSuccess] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [selectedCountry, setSelectedCountry] = useState('')

  // Update wallet address when it changes
  useEffect(() => {
    if (address) {
      setFormData(prev => ({ ...prev, wallet: address }))
    }
  }, [address])

  useEffect(() => {
    if (isSuccess) window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isSuccess])

  function handleKeyDown(e) {
    if (e.key === 'Escape' || e.key === 'Enter') setIsSuccess(false)
  }

  function handleInputChange(e) {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
    // Clear error when user starts typing
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: undefined }))
    }
  }

  function handleCountryChange(countryCode) {
    setSelectedCountry(countryCode)
    setFormData(prev => ({ ...prev, country: countryCode }))
    // Clear error when user selects country
    if (errors.country) {
      setErrors(prev => ({ ...prev, country: undefined }))
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setIsSubmitting(true)
    
    // Make sure wallet is set
    const dataToValidate = {
      ...formData,
      wallet: address || formData.wallet
    }
    
    const validation = providerSchema.safeParse(dataToValidate)
    if (!validation.success) {
      setErrors(validation.error.flatten().fieldErrors)
      setIsSubmitting(false)
      return
    }

    try {
      // Save registration to JSON file (no blockchain transaction)
      const response = await fetch('/api/provider/saveRegistration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dataToValidate)
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to save provider registration')
      }
      
      setIsSuccess(true)
      setErrors({})
      setFormData({ name: '', email: '', wallet: '', country: '' })
      setSelectedCountry('')
    } catch (err) {
      devLog.error('Provider registration error:', err)
      setErrors({ general: [err.message || 'Registration failed. Please try again later.'] })
    } finally {
      setIsSubmitting(false)
    }
  }

  // Show loading state while checking user status
  if (isLoading) {
    return (
      <Container padding="sm" className="text-center">
        <div className="flex-center space-x-2">
          <div className="spinner-md border-blue-600"></div>
          <span>Loading...</span>
        </div>
      </Container>
    )
  }
  
  if (isProvider) {
    return (
      <Container padding="sm" className="text-center">
        <div className="bg-success-bg border border-success-border rounded-lg p-6 max-w-md mx-auto">
          <h2 className="text-success-text text-xl font-semibold mb-2">Already Registered</h2>
          <p className="text-success">You are already registered as a provider.</p>
        </div>
      </Container>
    )
  }

  return (
    <AccessControl requireWallet message="Please connect your wallet to register as a provider.">
      <Container padding="sm">
        <div className="max-w-md mx-auto bg-white rounded-lg shadow-lg p-6">
          <h1 className="text-2xl font-bold text-center mb-6 text-gray-800">
            Register as Provider
          </h1>
          
          {/* Success Modal */}
          {isSuccess && (
            <div className="overlay-full overlay flex-center">
              <div className="bg-white p-6 rounded-lg shadow-xl max-w-sm mx-4">
                <h3 className="text-lg font-semibold text-success mb-2">Registration Submitted!</h3>
                <p className="text-gray-600 mb-4">
                  Your provider registration request has been submitted successfully. 
                  An administrator will review your application and contact you via email.
                </p>
                <Button 
                  onClick={() => setIsSuccess(false)}
                  variant="primary"
                  className="w-full"
                >
                  Close
                </Button>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* General Error */}
            {errors.general && (
              <div className="bg-error-bg border border-error-border rounded-lg p-3">
                <p className="text-error-text text-sm">{errors.general[0]}</p>
              </div>
            )}

            {/* Name Field */}
            <Input
              label="Provider Name"
              name="name"
              type="text"
              value={formData.name}
              onChange={handleInputChange}
              error={errors.name?.[0]}
              required
              placeholder="Your organization or lab name"
            />

            {/* Email Field */}
            <Input
              label="Email Address"
              name="email"
              type="email"
              value={formData.email}
              onChange={handleInputChange}
              error={errors.email?.[0]}
              required
              placeholder="your.email@institution.edu"
            />

            {/* Wallet Address (read-only) */}
            <Input
              label="Wallet Address"
              name="wallet"
              type="text"
              value={address || ''}
              readOnly
              error={errors.wallet?.[0]}
              helpText="Your connected wallet address"
              className="bg-gray-100 text-gray-500 cursor-not-allowed"
              disabled
            />

            {/* Country Field with Flag Selector */}
            <div className="space-y-1 text-black">
              <label className="block text-sm font-medium text-gray-700">
                Country *
              </label>
              <ReactFlagsSelect
                selected={selectedCountry}
                onSelect={handleCountryChange}
                searchable
                searchPlaceholder="Search for a country..."
                placeholder="Select your country"
                className="w-full"
                selectButtonClassName="w-full h-10 px-3 border border-gray-300 rounded-md text-left focus:ring-2 focus:ring-primary-600 focus:border-primary-600"
              />
              {errors.country && (
                <p className="text-error text-sm mt-1">{errors.country[0]}</p>
              )}
            </div>

            {/* Submit Button */}
            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="w-full"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Registering...' : 'Register as Provider'}
            </Button>
          </form>

          {/* Info Text */}
          <div className="mt-6 text-center text-sm text-gray-600">
            <p>
              By registering, you agree to provide accurate information and follow our community guidelines.
            </p>
          </div>
        </div>
      </Container>
    </AccessControl>
  )
}
