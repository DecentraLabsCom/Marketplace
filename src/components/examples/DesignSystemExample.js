/**
 * Design System Example Component
 * Demonstrates usage of the unified design system and UI components
 */
import React, { useState } from 'react'
import { 
  Button, 
  Card, 
  CardHeader, 
  CardContent, 
  CardFooter,
  Input, 
  Select, 
  Checkbox,
  Alert,
  Badge,
  Progress,
  Grid,
  Stack,
  Inline,
  Spinner
} from '@/components/ui'

/**
 * Example component showcasing the design system
 * This can be used as a reference for component usage
 */
export default function DesignSystemExample() {
  const [loading, setLoading] = useState(false)
  const [showAlert, setShowAlert] = useState(true)
  const [formData, setFormData] = useState({
    name: '',
    category: '',
    notifications: false
  })

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 2000))
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-6xl mx-auto px-8">
        
        {/* Header */}
        <div className="mb-12">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">
            Design System Example
          </h1>
          <p className="text-lg text-gray-600">
            Demonstration of the unified UI component library and design tokens
          </p>
        </div>

        {/* Alert Example */}
        {showAlert && (
          <div className="mb-8">
            <Alert 
              variant="info" 
              title="Design System Active"
              dismissible
              onDismiss={() => setShowAlert(false)}
            >
              This page demonstrates the standardized UI components and design tokens.
            </Alert>
          </div>
        )}

        <Grid cols={1} gap="lg" responsive={{ md: 2 }}>
          
          {/* Form Example */}
          <Card>
            <CardHeader 
              title="Form Components"
              subtitle="Standardized form inputs with consistent styling"
            />
            <CardContent>
              <form onSubmit={handleSubmit}>
                <Stack spacing="md">
                  <Input
                    label="Lab Name"
                    placeholder="Enter lab name"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({...prev, name: e.target.value}))}
                    required
                  />
                  
                  <Select
                    label="Category"
                    placeholder="Select a category"
                    value={formData.category}
                    onChange={(e) => setFormData(prev => ({...prev, category: e.target.value}))}
                    options={[
                      { value: 'physics', label: 'Physics' },
                      { value: 'chemistry', label: 'Chemistry' },
                      { value: 'biology', label: 'Biology' },
                      { value: 'engineering', label: 'Engineering' }
                    ]}
                  />
                  
                  <Checkbox
                    label="Enable notifications"
                    description="Receive updates about lab bookings"
                    checked={formData.notifications}
                    onChange={(e) => setFormData(prev => ({...prev, notifications: e.target.checked}))}
                  />
                </Stack>
              </form>
            </CardContent>
            <CardFooter>
              <Inline spacing="sm">
                <Button variant="outline" size="md">
                  Cancel
                </Button>
                <Button 
                  variant="primary" 
                  size="md" 
                  loading={loading}
                  onClick={handleSubmit}
                >
                  Save Lab
                </Button>
              </Inline>
            </CardFooter>
          </Card>

          {/* Components Showcase */}
          <Card>
            <CardHeader 
              title="UI Components"
              subtitle="Various components using design system tokens"
            />
            <CardContent>
              <Stack spacing="lg">
                
                {/* Buttons */}
                <div>
                  <h3 className="text-sm font-medium text-gray-900 mb-4">Buttons</h3>
                  <Inline spacing="sm" wrap>
                    <Button variant="primary" size="sm">Primary</Button>
                    <Button variant="secondary" size="sm">Secondary</Button>
                    <Button variant="outline" size="sm">Outline</Button>
                    <Button variant="ghost" size="sm">Ghost</Button>
                  </Inline>
                </div>

                {/* Badges */}
                <div>
                  <h3 className="text-sm font-medium text-gray-900 mb-4">Badges</h3>
                  <Inline spacing="sm" wrap>
                    <Badge variant="success">Active</Badge>
                    <Badge variant="warning">Pending</Badge>
                    <Badge variant="error">Error</Badge>
                    <Badge variant="info">Info</Badge>
                    <Badge variant="primary" removable onRemove={() => {}}>Removable</Badge>
                  </Inline>
                </div>

                {/* Progress */}
                <div>
                  <h3 className="text-sm font-medium text-gray-900 mb-4">Progress</h3>
                  <Stack spacing="sm">
                    <Progress value={30} showLabel label="Lab Usage" />
                    <Progress value={75} color="success" showLabel label="Completion" />
                    <Progress value={90} color="warning" showLabel label="Capacity" />
                  </Stack>
                </div>

                {/* Loading States */}
                <div>
                  <h3 className="text-sm font-medium text-gray-900 mb-4">Loading</h3>
                  <Inline spacing="md" align="center">
                    <Spinner size="sm" />
                    <Spinner size="md" />
                    <span className="text-sm text-gray-600">Loading content...</span>
                  </Inline>
                </div>

                {/* Color Tokens */}
                <div>
                  <h3 className="text-sm font-medium text-gray-900 mb-4">Design Tokens</h3>
                  <Grid cols={4} gap="sm">
                    <div className="bg-primary-500 h-8 rounded flex items-center justify-center text-white text-xs">
                      Primary
                    </div>
                    <div className="bg-secondary-500 h-8 rounded flex items-center justify-center text-white text-xs">
                      Secondary
                    </div>
                    <div className="bg-success h-8 rounded flex items-center justify-center text-white text-xs">
                      Success
                    </div>
                    <div className="bg-error h-8 rounded flex items-center justify-center text-white text-xs">
                      Error
                    </div>
                  </Grid>
                </div>

              </Stack>
            </CardContent>
          </Card>

        </Grid>

        {/* Footer */}
        <div className="mt-12 text-center">
          <p className="text-sm text-gray-500">
            All components use the centralized design system tokens for consistent styling.
          </p>
        </div>
      </div>
    </div>
  )
}
