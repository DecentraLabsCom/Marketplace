import { http, HttpResponse } from 'msw';
import { mockLabs } from './mockData';

/**
 * MSW request handlers
 * These mock API endpoints simulate backend behavior during testing.
 * They allow us to run tests without relying on a real server.
 */
export const handlers = [
  /**
   * GET /api/labs
   * Returns the full list of mock labs.
   */
  http.get('/api/labs', () => {
    return HttpResponse.json(mockLabs);
  }),

  /**
   * GET /api/labs/:id
   * Returns a single lab by ID if found, otherwise responds with 404.
   */
  http.get('/api/labs/:id', ({ params }) => {
    const { id } = params;
    const lab = mockLabs.find(lab => lab.id === parseInt(id));
    return lab 
      ? HttpResponse.json(lab)
      : new HttpResponse(null, { status: 404 });
  }),

  /**
   * POST /api/bookings
   * Creates a new booking with a unique ID and confirms it.
   */
  http.post('/api/bookings', async ({ request }) => {
    const newBooking = await request.json();
    return HttpResponse.json({
      id: Date.now(),
      ...newBooking,
      status: 'confirmed'
    }, { status: 201 });
  }),
];
