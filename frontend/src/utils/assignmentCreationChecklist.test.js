import { describe, expect, it } from 'vitest';
import {
  validateAssignmentFormFields,
  datetimeLocalToIso,
  utcIsoToKarachiDatetimeLocal,
  assignmentCreatedMessage,
} from './assignmentFieldValidation';
import { validateAcademicContent, referenceFileSelectionError } from './academicFileContent';
import { assertAcademicFile, MAX_DURABLE_FILE_BYTES, ACADEMIC_EXTENSIONS } from '../services/r2UploadService';
import { createSubmitLock } from './submitLock';

const NOW = Date.parse('2026-10-31T12:00:00.000Z');

function validate(overrides = {}, options = {}) {
  return validateAssignmentFormFields(
    {
      title: 'Week 4 Lab',
      description: 'Complete the exercises.',
      points: '25',
      startDate: '2026-10-31T18:00',
      deadline: '2026-11-02T18:00',
      ...overrides,
    },
    { mode: 'create', now: NOW, ...options }
  );
}

describe('frontend assignment creation rules', () => {
  it('rejects past, equal, and missing schedule values and accepts future dates', () => {
    expect(validate({ startDate: '' }).errors.startDate).toMatch(/Select a start date/);
    expect(validate({ startDate: '2026-11-01' }).errors.startDate).toMatch(/Select a start time/);
    expect(validate({ startDate: '2026-10-30T19:00' }).ok).toBe(false);
    expect(validate({ startDate: '2026-10-31T16:00' }).ok).toBe(false);
    expect(validate({ startDate: '2026-10-31T17:00' }).ok).toBe(false);
    expect(validate({ startDate: '2026-10-31T17:30', deadline: '2026-10-31T18:30' }).ok).toBe(true);
    expect(validate({ startDate: '2026-11-01T09:00', deadline: '2026-11-01T18:00' }).ok).toBe(true);
    expect(validate({ deadline: '2026-10-31T18:00', startDate: '2026-10-31T18:00' }).ok).toBe(false);
  });

  it('treats datetime-local as Asia/Karachi and does not shift a UTC instant', () => {
    expect(datetimeLocalToIso('2026-10-31T17:30')).toBe('2026-10-31T12:30:00.000Z');
    expect(utcIsoToKarachiDatetimeLocal('2026-10-31T12:30:00.000Z')).toBe('2026-10-31T17:30');
  });

  it('normalizes titles and marks without coercing blanks to zero', () => {
    expect(validate({ title: '  System   Design  ' }).values.title).toBe('System Design');
    expect(validate({ title: '  ' }).ok).toBe(false);
    expect(validate({ title: 'A'.repeat(101) }).ok).toBe(false);
    expect(validate({ title: "O'Brien's Lab" }).ok).toBe(true);
    expect(validate({ points: '' }).errors.points).toMatch(/required/i);
    expect(validate({ points: '0' }).errors.points).toMatch(/1-100/);
    expect(validate({ points: '10.5' }).ok).toBe(false);
    expect(validate({ points: '1' }).values.points).toBe(1);
    expect(validate({ points: '100' }).values.points).toBe(100);
    expect(validate({ points: '101' }).ok).toBe(false);
  });

  it('keeps the existing academic extensions and rejects empty, huge, and mismatched files', () => {
    expect(ACADEMIC_EXTENSIONS).not.toContain('exe');
    expect(ACADEMIC_EXTENSIONS).not.toContain('mp4');
    expect(ACADEMIC_EXTENSIONS).toContain('pdf');
    expect(() => assertAcademicFile({ name: 'brief.pdf', size: 10 })).not.toThrow();
    expect(() => assertAcademicFile({ name: 'clip.mp4', size: 10 })).toThrow(/not supported|not allowed/i);
    expect(() => assertAcademicFile({ name: 'notes.pdf', size: 0 })).toThrow(/empty/i);
    expect(() => assertAcademicFile({ name: 'big.pdf', size: MAX_DURABLE_FILE_BYTES + 1 })).toThrow(/exceeds the limit/i);
    expect(validateAcademicContent('brief.pdf', new TextEncoder().encode('%PDF-1.4'))).toEqual({ ok: true });
    expect(validateAcademicContent('brief.pdf', new Uint8Array([0x4d, 0x5a, 0x00])).ok).toBe(false);
    expect(referenceFileSelectionError([{ name: 'a.pdf' }, { name: 'b.pdf' }])).toMatch(/one reference file/i);
  });

  it('uses the scheduled confirmation only for a later Karachi day', () => {
    expect(assignmentCreatedMessage('2026-10-31T12:30:00.000Z', NOW)).toBe(
      'Assignment created successfully.'
    );
    const scheduled = assignmentCreatedMessage('2026-11-01T04:00:00.000Z', NOW);
    expect(scheduled.startsWith('Assignment scheduled successfully.')).toBe(true);
    expect(scheduled).toMatch(/Students can access it from 1 Nov 2026 at /);
  });

  it('blocks a second submit while the first is pending', () => {
    const lock = createSubmitLock();
    expect(lock.tryBegin()).toBe(true);
    expect(lock.tryBegin()).toBe(false);
    lock.end();
    expect(lock.pending).toBe(false);
  });
});
