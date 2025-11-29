import React, { useState } from 'react';
import { healthcareTenantConfig } from '@/app/tenant/healthcare';

interface HealthcareWidgetExtensionsProps {
  onSendMessage: (message: string) => void;
  tenantId: string;
}

export function HealthcareWidgetExtensions({ onSendMessage, tenantId }: HealthcareWidgetExtensionsProps) {
  const [bookingStatus, setBookingStatus] = useState<string | null>(null);

  const handleBookAppointment = async () => {
    setBookingStatus('Booking...');
    try {
      const response = await fetch('/api/healthcare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          action: 'book_appointment',
          payload: {
            patientName: 'Guest User', // In real app, get from auth context
            date: new Date().toISOString().split('T')[0], // Today
            reason: 'General Consultation'
          }
        })
      });
      
      const data = await response.json();
      if (data.success) {
        setBookingStatus(`Appointment Confirmed! ID: ${data.appointmentId}`);
      } else {
        setBookingStatus('Booking failed. Please try again.');
      }
    } catch (error) {
      setBookingStatus('Error booking appointment.');
    }
  };

  return (
    <div className="p-4 border-t border-gray-200 bg-blue-50">
      <div className="text-xs text-gray-500 mb-2 italic">
        {healthcareTenantConfig.disclaimer}
      </div>
      
      <div className="flex flex-wrap gap-2 mb-3">
        {healthcareTenantConfig.medicalPrompts.map((prompt, idx) => (
          <button
            key={idx}
            onClick={() => onSendMessage(prompt)}
            className="text-xs bg-white border border-blue-200 text-blue-700 px-2 py-1 rounded-full hover:bg-blue-100 transition-colors"
          >
            {prompt}
          </button>
        ))}
      </div>

      {healthcareTenantConfig.appointmentBooking && (
        <div className="mt-2">
          <button
            onClick={handleBookAppointment}
            className="w-full bg-blue-600 text-white text-sm py-2 rounded hover:bg-blue-700 transition-colors"
          >
            Book Appointment
          </button>
          {bookingStatus && (
            <p className="text-xs text-center mt-1 font-medium text-blue-800">
              {bookingStatus}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
