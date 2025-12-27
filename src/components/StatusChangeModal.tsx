const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  setLoading(true);
  setError(null);

  try {
    const startTimeISO = startTime ? new Date(startTime).toISOString() : null;
    const endTimeISO = endTime ? new Date(endTime).toISOString() : null;

    let status = 'checked_out';
    if (statusAction === 'rejected') {
      status = 'rejected';
    } else if (statusAction === 'turned_away') {
      status = 'turned_away';
    }

    const updateData: any = {
      status: status,
    };

    if (startTimeISO) {
      updateData.start_time = startTimeISO;
    }

    if (endTimeISO) {
      updateData.end_time = endTimeISO;
    }

    if (notes) {
      updateData.notes = notes;
    }

    console.log('Check-in ID:', checkIn.id);
    console.log('Update data:', updateData);

    const { data, error: updateError } = await supabase
      .from('check_ins')
      .update(updateData)
      .eq('id', checkIn.id)
      .select();

    console.log('Update response:', { data, error: updateError });

    if (updateError) {
      console.error('Update error details:', updateError);
      throw new Error(`Database error: ${updateError.message} (Code: ${updateError.code})`);
    }

    if (!data || data.length === 0) {
      throw new Error('No rows were updated. Check if the record exists.');
    }

    alert('Status updated successfully!');
    onSuccess();
    onClose();
  } catch (err) {
    console.error('Error updating status:', err);
    const errorMessage = err instanceof Error ? err.message : 'Failed to update status';
    setError(errorMessage);
    alert(`Error: ${errorMessage}`);
  } finally {
    setLoading(false);
  }
};
