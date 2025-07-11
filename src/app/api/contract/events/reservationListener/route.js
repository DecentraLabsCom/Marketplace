import eventManager from '../../utils/reservationEventManager';

export async function POST(request) {
  const body = await request.json();
  const { action } = body;
  
  try {
    if (action === 'start') {
      const status = eventManager.getStatus();
      if (status.isListening) {
        return Response.json({ message: 'Event listener already running', status });
      }
      
      await eventManager.startListener();
      return Response.json({ success: true, message: 'Event listener started' });
      
    } else if (action === 'stop') {
      const status = eventManager.getStatus();
      if (!status.isListening) {
        return Response.json({ message: 'Event listener not running', status });
      }
      
      await eventManager.stopListener();
      return Response.json({ success: true, message: 'Event listener stopped' });
      
    } else if (action === 'status') {
      const status = eventManager.getStatus();
      return Response.json({ 
        ...status,
        message: status.isListening ? 'Event listener is active' : 'Event listener is inactive'
      });
      
    } else if (action === 'restart') {
      await eventManager.stopListener();
      await eventManager.startListener();
      return Response.json({ success: true, message: 'Event listener restarted' });
    }
    
    return Response.json({ error: 'Invalid action. Use start, stop, restart, or status' }, { status: 400 });
    
  } catch (error) {
    console.error('Error managing event listener:', error);
    return Response.json({ 
      error: 'Failed to manage event listener',
      details: error.message 
    }, { status: 500 });
  }
}
