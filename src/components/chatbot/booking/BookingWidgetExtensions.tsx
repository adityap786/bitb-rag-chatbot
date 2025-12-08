
import React, { useState } from 'react';
import { Calendar, Clock, CheckCircle } from 'lucide-react';

interface BookingWidgetExtensionsProps {
  onSendMessage: (message: string) => void;
  tenantId: string;
  lastMessageMetadata?: any;
}

export function BookingWidgetExtensions({ onSendMessage, tenantId, lastMessageMetadata }: BookingWidgetExtensionsProps) {
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [slots, setSlots] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [bookingStatus, setBookingStatus] = useState<any>(null);

  const fetchSlots = async (date: string) => {
    setLoading(true);
    try {
      const res = await fetch('/api/booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get_slots', payload: { date } })
      });
      const data = await res.json();
      setSlots(data.slots || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // Fetch slots when date changes
  React.useEffect(() => {
    fetchSlots(selectedDate);
  }, [selectedDate]);

  const handleBook = async (slot: any) => {
    const name = prompt('Enter your name:');
    const email = prompt('Enter your email:');
    if (!name || !email) return;

    setLoading(true);
    try {
      const res = await fetch('/api/booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action: 'book_slot', 
          payload: { slotId: slot.id, name, email } 
        })
      });
      const data = await res.json();
      if (data.success) {
        setBookingStatus(data.booking);
        onSendMessage(`I've booked an appointment for ${new Date(slot.startTime).toLocaleTimeString()} on ${selectedDate}.`);
        fetchSlots(selectedDate); // Refresh slots
      } else {
        alert('Booking failed');
      }
    } catch (e) {
      alert('Error booking slot');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-3 bg-white/5 border-t border-gray-200 rounded-md mt-2">
      <div className="flex items-center gap-2 mb-3 text-sm font-medium text-gray-700 dark:text-gray-200">
        <Calendar className="w-4 h-4" />
        <span>Schedule Appointment</span>
      </div>

      {bookingStatus ? (
        <div className="bg-green-50 border border-green-200 p-3 rounded-md text-center">
          <CheckCircle className="w-8 h-8 text-green-500 mx-auto mb-2" />
          <p className="text-sm font-bold text-green-800">Confirmed!</p>
          <p className="text-xs text-green-700">
            {new Date(bookingStatus.createdAt).toLocaleDateString()}
          </p>
          <button 
            onClick={() => setBookingStatus(null)}
            className="mt-2 text-xs text-blue-600 hover:underline"
          >
            Book another
          </button>
        </div>
      ) : (
        <>
          <input 
            type="date" 
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="w-full p-2 text-sm border rounded mb-3 bg-white dark:bg-slate-800 dark:border-slate-700"
          />

          <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto custom-scrollbar">
            {loading && <div className="col-span-2 text-center text-xs text-gray-500">Loading slots...</div>}
            {!loading && slots.length === 0 && <div className="col-span-2 text-center text-xs text-gray-500">No slots available</div>}
            
            {slots.map(slot => (
              <button
                key={slot.id}
                disabled={!slot.available}
                onClick={() => handleBook(slot)}
                className={`p-2 text-xs rounded border flex items-center justify-center gap-1 transition-colors
                  ${slot.available 
                    ? 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100' 
                    : 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed'
                  }`}
              >
                <Clock className="w-3 h-3" />
                {new Date(slot.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
