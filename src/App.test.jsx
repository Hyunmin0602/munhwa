import { expect, test } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import App from './App';

test('shows the current month and synchronizes the today button', () => {
  render(<App />);
  expect(screen.getByRole('button', { name: '오늘' })).toBeDefined();
  expect(screen.getByRole('button', { name: '월별' }).getAttribute('aria-pressed')).toBe(
    'true',
  );
});

test('switches between monthly and daily views', () => {
  render(<App />);

  fireEvent.click(screen.getByRole('button', { name: '일별' }));
  expect(screen.getByText('등록된 일정이 없습니다.')).toBeDefined();
  expect(screen.getByRole('button', { name: '일별' }).getAttribute('aria-pressed')).toBe(
    'true',
  );

  fireEvent.click(screen.getByRole('button', { name: '월별' }));
  expect(screen.getByRole('button', { name: '월별' }).getAttribute('aria-pressed')).toBe(
    'true',
  );
});
