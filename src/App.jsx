import { useMemo, useState } from 'react';
import './App.css';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const MONTHS = [
  '1월',
  '2월',
  '3월',
  '4월',
  '5월',
  '6월',
  '7월',
  '8월',
  '9월',
  '10월',
  '11월',
  '12월',
];

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function dateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isSameDay(first, second) {
  return dateKey(first) === dateKey(second);
}

function addDays(date, amount) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + amount);
  return nextDate;
}

function getCalendarDays(date) {
  const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
  const startDate = addDays(firstDay, -firstDay.getDay());
  return Array.from({ length: 42 }, (_, index) => addDays(startDate, index));
}

function App() {
  const today = useMemo(() => startOfDay(new Date()), []);
  const [selectedDate, setSelectedDate] = useState(today);
  const [viewMode, setViewMode] = useState('month');

  const calendarDays = useMemo(() => getCalendarDays(selectedDate), [selectedDate]);
  const isTodaySelected = isSameDay(selectedDate, today);

  const moveDate = (amount) => {
    setSelectedDate((currentDate) =>
      viewMode === 'month'
        ? new Date(currentDate.getFullYear(), currentDate.getMonth() + amount, 1)
        : addDays(currentDate, amount),
    );
  };

  const selectDate = (date) => {
    setSelectedDate(startOfDay(date));
  };

  const goToToday = () => {
    setSelectedDate(today);
  };

  return (
    <main className="calendar-app">
      <section className="calendar-card" aria-label="달력">
        <header className="calendar-header">
          <div>
            <p className="eyebrow">MY CALENDAR</p>
            <h1>
              {selectedDate.getFullYear()}년 {MONTHS[selectedDate.getMonth()]}
            </h1>
          </div>
          <button
            className={`today-button ${isTodaySelected ? 'is-active' : ''}`}
            type="button"
            onClick={goToToday}
          >
            오늘
          </button>
        </header>

        <nav className="view-switcher" aria-label="달력 보기 선택">
          <button
            className={viewMode === 'month' ? 'selected' : ''}
            type="button"
            aria-pressed={viewMode === 'month'}
            onClick={() => setViewMode('month')}
          >
            월별
          </button>
          <button
            className={viewMode === 'day' ? 'selected' : ''}
            type="button"
            aria-pressed={viewMode === 'day'}
            onClick={() => setViewMode('day')}
          >
            일별
          </button>
        </nav>

        <div className="date-navigation">
          <button type="button" aria-label="이전" onClick={() => moveDate(-1)}>
            ‹
          </button>
          <strong>
            {viewMode === 'month'
              ? `${selectedDate.getFullYear()}년 ${MONTHS[selectedDate.getMonth()]}`
              : `${selectedDate.getMonth() + 1}월 ${selectedDate.getDate()}일 (${WEEKDAYS[selectedDate.getDay()]})`}
          </strong>
          <button type="button" aria-label="다음" onClick={() => moveDate(1)}>
            ›
          </button>
        </div>

        {viewMode === 'month' ? (
          <div className="month-view">
            <div className="weekday-row" aria-hidden="true">
              {WEEKDAYS.map((weekday) => (
                <span key={weekday}>{weekday}</span>
              ))}
            </div>
            <div className="month-grid">
              {calendarDays.map((date) => {
                const isCurrentMonth = date.getMonth() === selectedDate.getMonth();
                const isSelected = isSameDay(date, selectedDate);
                return (
                  <button
                    className={[
                      'day-cell',
                      date.getDay() === 0 ? 'sunday' : '',
                      date.getDay() === 6 ? 'saturday' : '',
                      isCurrentMonth ? '' : 'outside-month',
                      isSelected ? 'selected-day' : '',
                    ].join(' ')}
                    key={dateKey(date)}
                    type="button"
                    aria-label={`${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`}
                    aria-pressed={isSelected}
                    onClick={() => selectDate(date)}
                  >
                    <span>{date.getDate()}</span>
                    {isSameDay(date, today) && <i aria-label="오늘" />}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="day-view">
            <p className="day-label">{isTodaySelected ? '오늘' : '선택한 날짜'}</p>
            <p className="large-date">{selectedDate.getDate()}</p>
            <p className="full-date">
              {selectedDate.getFullYear()}년 {selectedDate.getMonth() + 1}월{' '}
              {selectedDate.getDate()}일 {WEEKDAYS[selectedDate.getDay()]}요일
            </p>
            <div className="empty-schedule">등록된 일정이 없습니다.</div>
          </div>
        )}
      </section>
    </main>
  );
}

export default App;
