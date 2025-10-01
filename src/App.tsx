import { useState, useEffect } from 'react'
import './App.css'

function App() {
  const [currentTime, setCurrentTime] = useState(new Date())
  const [is24Hour, setIs24Hour] = useState(true)

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date())
    }, 1000)

    return () => clearInterval(timer)
  }, [])

  const formatTime = (date: Date) => {
    const hours = date.getHours()
    const minutes = date.getMinutes()
    const seconds = date.getSeconds()

    if (is24Hour) {
      return {
        hours: hours.toString().padStart(2, '0'),
        minutes: minutes.toString().padStart(2, '0'),
        seconds: seconds.toString().padStart(2, '0'),
        period: null
      }
    } else {
      const period = hours >= 12 ? 'PM' : 'AM'
      const displayHours = hours % 12 || 12
      return {
        hours: displayHours.toString().padStart(2, '0'),
        minutes: minutes.toString().padStart(2, '0'),
        seconds: seconds.toString().padStart(2, '0'),
        period
      }
    }
  }

  const formatDate = (date: Date) => {
    const options: Intl.DateTimeFormatOptions = { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    }
    return date.toLocaleDateString('en-US', options)
  }

  const time = formatTime(currentTime)

  return (
    <div className="clock-container">
      <div className="clock-wrapper">
        <h1 className="app-title">Digital Clock</h1>
        
        <div className="time-display">
          <span className="time-digit">{time.hours}</span>
          <span className="time-separator">:</span>
          <span className="time-digit">{time.minutes}</span>
          <span className="time-separator">:</span>
          <span className="time-digit">{time.seconds}</span>
          {time.period && <span className="time-period">{time.period}</span>}
        </div>

        <div className="date-display">
          {formatDate(currentTime)}
        </div>

        <button 
          className="format-toggle"
          onClick={() => setIs24Hour(!is24Hour)}
        >
          Switch to {is24Hour ? '12' : '24'}-Hour Format
        </button>
      </div>
    </div>
  )
}

export default App
