'use client'

import { useState, useEffect } from 'react'
import './tracking.css'

interface CheckInRecord {
  id: number
  studentName: string
  appointmentTime: string
  doorUsed: string
  checkInStatus: 'on-time' | 'late'
  detentionGiven: boolean
  timestamp: string
}

interface CheckInData {
  total: number
  onTime: number
  late: number
  detentions: number
  byTime: { [key: string]: number }
  byDoor: { [key: string]: number }
  records: CheckInRecord[]
}

export default function TrackingPage() {
  const [checkInData, setCheckInData] = useState<CheckInData>({
    total: 0,
    onTime: 0,
    late: 0,
    detentions: 0,
    byTime: {},
    byDoor: {},
    records: []
  })

  const [formData, setFormData] = useState({
    studentName: '',
    appointmentTime: '',
    doorUsed: '',
    checkInStatus: 'on-time' as 'on-time' | 'late',
    detentionGiven: 'no'
  })

  // Load data from localStorage on mount
  useEffect(() => {
    const savedData = localStorage.getItem('checkInData')
    if (savedData) {
      setCheckInData(JSON.parse(savedData))
    }
  }, [])

  // Save data to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('checkInData', JSON.stringify(checkInData))
  }, [checkInData])

  const recordCheckIn = () => {
    if (!formData.studentName || !formData.appointmentTime || !formData.doorUsed) {
      alert('Please fill in all required fields!')
      return
    }

    const record: CheckInRecord = {
      id: Date.now(),
      studentName: formData.studentName,
      appointmentTime: formData.appointmentTime,
      doorUsed: formData.doorUsed,
      checkInStatus: formData.checkInStatus,
      detentionGiven: formData.detentionGiven === 'yes',
      timestamp: new Date().toISOString()
    }

    setCheckInData(prev => ({
      total: prev.total + 1,
      onTime: prev.onTime + (formData.checkInStatus === 'on-time' ? 1 : 0),
      late: prev.late + (formData.checkInStatus === 'late' ? 1 : 0),
      detentions: prev.detentions + (formData.detentionGiven === 'yes' ? 1 : 0),
      byTime: {
        ...prev.byTime,
        [formData.appointmentTime]: (prev.byTime[formData.appointmentTime] || 0) + 1
      },
      byDoor: {
        ...prev.byDoor,
        [formData.doorUsed]: (prev.byDoor[formData.doorUsed] || 0) + 1
      },
      records: [...prev.records, record]
    }))

    // Clear form
    setFormData({
      studentName: '',
      appointmentTime: '',
      doorUsed: '',
      checkInStatus: 'on-time',
      detentionGiven: 'no'
    })

    alert('Check-in recorded successfully!')
  }

  const exportData = () => {
    const dataStr = JSON.stringify(checkInData, null, 2)
    const dataBlob = new Blob([dataStr], { type: 'application/json' })
    const url = URL.createObjectURL(dataBlob)
    const link = document.createElement('a')
    link.href = url
    const today = new Date().toISOString().split('T')<a href="" class="citation-link" target="_blank" style="vertical-align: super; font-size: 0.8em; margin-left: 3px;">[0]</a>
    link.download = `check-in-data-${today}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  const clearAllData = () => {
    if (confirm('Are you sure you want to clear all data? This cannot be undone!')) {
      setCheckInData({
        total: 0,
        onTime: 0,
        late: 0,
        detentions: 0,
        byTime: {},
        byDoor: {},
        records: []
      })
      alert('All data has been cleared!')
    }
  }

  const calculatePercentage = (value: number, total: number) => {
    return total > 0 ? ((value / total) * 100).toFixed(1) : '0'
  }

  const BarChart = ({ data }: { data: { [key: string]: number } }) => {
    if (Object.keys(data).length === 0) {
      return <p style={{ textAlign: 'center', color: '#999' }}>No data yet</p>
    }

    const sortedData = Object.entries(data).sort((a, b) => b<a href="" class="citation-link" target="_blank" style="vertical-align: super; font-size: 0.8em; margin-left: 3px;">[1]</a> - a<a href="" class="citation-link" target="_blank" style="vertical-align: super; font-size: 0.8em; margin-left: 3px;">[1]</a>)
    const maxValue = Math.max(...Object.values(data))

    return (
      <div className="bar-chart">
        {sortedData.map(([label, value]) => {
          const percentage = (value / maxValue) * 100
          return (
            <div key={label} className="bar-item">
              <div className="bar-label">{label}</div>
              <div className="bar-container">
                <div className="bar-fill" style={{ width: `${percentage}%` }}>
                  {value}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="tracking-container">
      <h1>📊 Check-In Tracking Dashboard</h1>

      {/* Statistics Cards */}
      <div className="stats-grid">
        <div className="stat-card">
          <h3>Total Check-Ins</h3>
          <div className="number">{checkInData.total}</div>
        </div>
        <div className="stat-card">
          <h3>On-Time Check-Ins</h3>
          <div className="number">{checkInData.onTime}</div>
          <div className="percentage on-time">
            {calculatePercentage(checkInData.onTime, checkInData.total)}%
          </div>
        </div>
        <div className="stat-card">
          <h3>Late Check-Ins</h3>
          <div className="number">{checkInData.late}</div>
          <div className="percentage late">
            {calculatePercentage(checkInData.late, checkInData.total)}%
          </div>
        </div>
        <div className="stat-card">
          <h3>Detentions Given</h3>
          <div className="number">{checkInData.detentions}</div>
          <div className="percentage detention">
            {calculatePercentage(checkInData.detentions, checkInData.total)}%
          </div>
        </div>
      </div>

      {/* Check-In Form */}
      <div className="controls">
        <h3>Record New Check-In</h3>
        <div className="form-group">
          <input
            type="text"
            placeholder="Student Name"
            value={formData.studentName}
            onChange={(e) => setFormData({ ...formData, studentName: e.target.value })}
          />
          <select
            value={formData.appointmentTime}
            onChange={(e) => setFormData({ ...formData, appointmentTime: e.target.value })}
          >
            <option value="">Select Time</option>
            <option value="8:00 AM">8:00 AM</option>
            <option value="9:00 AM">9:00 AM</option>
            <option value="10:00 AM">10:00 AM</option>
            <option value="11:00 AM">11:00 AM</option>
            <option value="12:00 PM">12:00 PM</option>
            <option value="1:00 PM">1:00 PM</option>
            <option value="2:00 PM">2:00 PM</option>
            <option value="3:00 PM">3:00 PM</option>
          </select>
          <select
            value={formData.doorUsed}
            onChange={(e) => setFormData({ ...formData, doorUsed: e.target.value })}
          >
            <option value="">Select Door</option>
            <option value="Main Entrance">Main Entrance</option>
            <option value="Side Door A">Side Door A</option>
            <option value="Side Door B">Side Door B</option>
            <option value="Back Entrance">Back Entrance</option>
          </select>
          <select
            value={formData.checkInStatus}
            onChange={(e) => setFormData({ ...formData, checkInStatus: e.target.value as 'on-time' | 'late' })}
          >
            <option value="on-time">On Time</option>
            <option value="late">Late</option>
          </select>
          <select
            value={formData.detentionGiven}
            onChange={(e) => setFormData({ ...formData, detentionGiven: e.target.value })}
          >
            <option value="no">No Detention</option>
            <option value="yes">Detention Given</option>
          </select>
        </div>
        <div className="btn-group">
          <button onClick={recordCheckIn}>Record Check-In</button>
          <button onClick={exportData}>Export Data</button>
          <button className="danger" onClick={clearAllData}>Clear All Data</button>
        </div>
      </div>

      {/* Charts Section */}
      <div className="charts-section">
        <div className="chart-card">
          <h3>Check-Ins by Appointment Time</h3>
          <BarChart data={checkInData.byTime} />
        </div>
        <div className="chart-card">
          <h3>Most Used Doors</h3>
          <BarChart data={checkInData.byDoor} />
        </div>
      </div>
    </div>
  )
}
