// Labs dataset for testing components and API mocks
export const mockLabs = [
  {
    id: 1,
    name: 'Electronics Lab',
    description: 'Advanced electronics laboratory',
    image: '/labs/lab_1.jpg',
    price: '0.1',
    available: true,
    provider: '0x123...',
    category: 'Electronics'
  },
  {
    id: 2,
    name: 'Robotics Lab',
    description: 'Robotics and automation lab',
    image: '/labs/lab_2.jpg',
    price: '0.2',
    available: false,
    provider: '0x456...',
    category: 'Robotics'
  }
]

// Example user object for testing user-related flows
export const mockUser = {
  address: '0x789...',
  balance: '10.5',
  reservations: []
}
