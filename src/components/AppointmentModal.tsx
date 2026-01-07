useEffect(() => {
  if (appointment) {
    setFormData({
      scheduled_date: appointment.scheduled_date,
      scheduled_time: appointment.scheduled_time,
      sales_order: appointment.sales_order,
      delivery: appointment.delivery
    });
  } else {
    setFormData({
      scheduled_date: defaultDate,
      scheduled_time: '0800',
      sales_order: '',
      delivery: ''
    });
  }
}, [appointment, defaultDate]);

const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  
  // Validate at least one reference number
  if (!formData.sales_order && !formData.delivery) {
    alert('Please provide either a Sales Order or Delivery number');
    return;
  }
  
  await onSave(formData);
  onClose();
};

if (!isOpen) return null;


  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <h2 className="text-xl font-bold mb-4">
          {appointment ? 'Edit' : 'Add'} Appointment
        </h2>
        
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">Scheduled Date</label>
            <input
              type="date"
              value={formData.scheduled_date}
              onChange={(e) => setFormData({ ...formData, scheduled_date: e.target.value })}
              className="w-full p-2 border rounded"
              required
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">Scheduled Time</label>
            <select
              value={formData.scheduled_time}
              onChange={(e) => setFormData({ ...formData, scheduled_time: e.target.value })}
              className="w-full p-2 border rounded"
              required
            >
              {TIME_SLOTS.map(slot => (
                <option key={slot} value={slot}>
                  {slot === 'Work In' ? 'Work In' : `${slot.substring(0, 2)}:${slot.substring(2)}`}
                </option>
              ))}
            </select>
          <div>
  <label className="block text-sm font-medium mb-1">
    Sales Order <span className="text-gray-500 text-xs">(at least one required)</span>
  </label>
  <input
    type="text"
    value={formData.sales_order || ''}
    onChange={(e) => setFormData({ ...formData, sales_order: e.target.value })}
    className="w-full border rounded px-3 py-2"
  />
</div>

<div>
  <label className="block text-sm font-medium mb-1">
    Delivery <span className="text-gray-500 text-xs">(at least one required)</span>
  </label>
  <input
    type="text"
    value={formData.delivery || ''}
    onChange={(e) => setFormData({ ...formData, delivery: e.target.value })}
    className="w-full border rounded px-3 py-2"
  />
</div>


          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border rounded hover:bg-gray-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

