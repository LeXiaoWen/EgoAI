/**
 * Unit tests for commandSafety.ts
 *
 * Tests the three exported pure functions that classify shell commands
 * by their potential for destructive side-effects:
 *
 *   - isDeleteCommand:       returns true when the command contains a
 *                            recognised delete verb (rm, rmdir, unlink,
 *                            del, erase, remove-item, find -delete,
 *                            git clean, osascript … delete).
 *
 *   - isDangerousCommand:    superset of isDeleteCommand that also
 *                            matches git push, git reset --hard, kill,
 *                            chmod/chown.
 *
 *   - getCommandDangerLevel: returns { level, reason } where level is
 *                            'destructive' | 'caution' | 'safe'.
 */
import { expect, test } from 'vitest';

import { getCommandDangerLevel, isDangerousCommand, isDeleteCommand } from './commandSafety';

// ── isDeleteCommand ──────────────────────────────────────────────────────────

test('isDeleteCommand: rm matches', () => {
  expect(isDeleteCommand('rm file.txt')).toBe(true);
});

test('isDeleteCommand: rm with multiple flags matches', () => {
  expect(isDeleteCommand('rm -i obsolete.log')).toBe(true);
});

test('isDeleteCommand: rmdir matches', () => {
  expect(isDeleteCommand('rmdir /tmp/build')).toBe(true);
});

test('isDeleteCommand: unlink matches', () => {
  expect(isDeleteCommand('unlink /var/run/app.pid')).toBe(true);
});

test('isDeleteCommand: del matches (Windows style)', () => {
  expect(isDeleteCommand('del C:\\Users\\foo\\bar.txt')).toBe(true);
});

test('isDeleteCommand: erase matches', () => {
  expect(isDeleteCommand('erase temp.dat')).toBe(true);
});

test('isDeleteCommand: remove-item matches (PowerShell)', () => {
  expect(isDeleteCommand('Remove-Item -Path C:\\Logs\\*.log')).toBe(true);
});

test('isDeleteCommand: find -delete matches', () => {
  expect(isDeleteCommand('find . -name "*.tmp" -delete')).toBe(true);
});

test('isDeleteCommand: git clean matches', () => {
  expect(isDeleteCommand('git clean -fd')).toBe(true);
});

test('isDeleteCommand: git clean with extra flags matches', () => {
  expect(isDeleteCommand('git clean -fdx')).toBe(true);
});

test('isDeleteCommand: ls does not match', () => {
  expect(isDeleteCommand('ls -la /tmp')).toBe(false);
});

test('isDeleteCommand: git push does not match', () => {
  expect(isDeleteCommand('git push origin main')).toBe(false);
});

test('isDeleteCommand: echo does not match', () => {
  expect(isDeleteCommand('echo "hello world"')).toBe(false);
});

test('isDeleteCommand: npm install does not match', () => {
  expect(isDeleteCommand('npm install react')).toBe(false);
});

test('isDeleteCommand: cat does not match', () => {
  expect(isDeleteCommand('cat /etc/hosts')).toBe(false);
});

// ── isDangerousCommand ───────────────────────────────────────────────────────

test('isDangerousCommand: delete commands are dangerous', () => {
  expect(isDangerousCommand('rm -rf /tmp/old')).toBe(true);
});

test('isDangerousCommand: git push origin main is dangerous', () => {
  expect(isDangerousCommand('git push origin main')).toBe(true);
});

test('isDangerousCommand: git push with upstream flag is dangerous', () => {
  expect(isDangerousCommand('git push -u origin feat/my-branch')).toBe(true);
});

test('isDangerousCommand: git reset --hard is dangerous', () => {
  expect(isDangerousCommand('git reset --hard HEAD~1')).toBe(true);
});

test('isDangerousCommand: kill is dangerous', () => {
  expect(isDangerousCommand('kill -9 12345')).toBe(true);
});

test('isDangerousCommand: killall is dangerous', () => {
  expect(isDangerousCommand('killall node')).toBe(true);
});

test('isDangerousCommand: pkill is dangerous', () => {
  expect(isDangerousCommand('pkill -f my-server')).toBe(true);
});

test('isDangerousCommand: chmod is dangerous', () => {
  expect(isDangerousCommand('chmod 777 /usr/local/bin/app')).toBe(true);
});

test('isDangerousCommand: chown is dangerous', () => {
  expect(isDangerousCommand('chown root:root /etc/shadow')).toBe(true);
});

test('isDangerousCommand: ls is safe', () => {
  expect(isDangerousCommand('ls -la')).toBe(false);
});

test('isDangerousCommand: cat is safe', () => {
  expect(isDangerousCommand('cat README.md')).toBe(false);
});

test('isDangerousCommand: npm install is safe', () => {
  expect(isDangerousCommand('npm install')).toBe(false);
});

test('isDangerousCommand: git status is safe', () => {
  expect(isDangerousCommand('git status')).toBe(false);
});

test('isDangerousCommand: git log is safe', () => {
  expect(isDangerousCommand('git log --oneline -10')).toBe(false);
});

// ── getCommandDangerLevel ────────────────────────────────────────────────────

// ─── destructive ──────────────────────────────────────

test('getCommandDangerLevel: rm -rf → destructive / recursive-delete', () => {
  const result = getCommandDangerLevel('rm -rf /tmp/old');
  expect(result.level).toBe('destructive');
  expect(result.reason).toBe('recursive-delete');
});

test('getCommandDangerLevel: rm -r → destructive / recursive-delete', () => {
  const result = getCommandDangerLevel('rm -r build/');
  expect(result.level).toBe('destructive');
  expect(result.reason).toBe('recursive-delete');
});

test('getCommandDangerLevel: rm --recursive → destructive / recursive-delete', () => {
  const result = getCommandDangerLevel('rm --recursive dist/');
  expect(result.level).toBe('destructive');
  expect(result.reason).toBe('recursive-delete');
});

test('getCommandDangerLevel: git push --force → destructive / git-force-push', () => {
  const result = getCommandDangerLevel('git push --force origin main');
  expect(result.level).toBe('destructive');
  expect(result.reason).toBe('git-force-push');
});

test('getCommandDangerLevel: git push -f → destructive / git-force-push', () => {
  const result = getCommandDangerLevel('git push -f origin feat/fix');
  expect(result.level).toBe('destructive');
  expect(result.reason).toBe('git-force-push');
});

test('getCommandDangerLevel: git reset --hard → destructive / git-reset-hard', () => {
  const result = getCommandDangerLevel('git reset --hard HEAD~3');
  expect(result.level).toBe('destructive');
  expect(result.reason).toBe('git-reset-hard');
});

test('getCommandDangerLevel: dd command → destructive / disk-overwrite', () => {
  const result = getCommandDangerLevel('dd if=/dev/zero of=/dev/sda bs=512');
  expect(result.level).toBe('destructive');
  expect(result.reason).toBe('disk-overwrite');
});

test('getCommandDangerLevel: mkfs command → destructive / disk-format', () => {
  const result = getCommandDangerLevel('mkfs.ext4 /dev/sdb1');
  expect(result.level).toBe('destructive');
  expect(result.reason).toBe('disk-format');
});

// ─── caution ──────────────────────────────────────────

test('getCommandDangerLevel: plain rm → caution / file-delete', () => {
  const result = getCommandDangerLevel('rm old-file.txt');
  expect(result.level).toBe('caution');
  expect(result.reason).toBe('file-delete');
});

test('getCommandDangerLevel: find -delete → caution / file-delete', () => {
  const result = getCommandDangerLevel('find /tmp -name "*.log" -mtime +7 -delete');
  expect(result.level).toBe('caution');
  expect(result.reason).toBe('file-delete');
});

test('getCommandDangerLevel: git clean → caution / file-delete', () => {
  const result = getCommandDangerLevel('git clean -fd');
  expect(result.level).toBe('caution');
  expect(result.reason).toBe('file-delete');
});

test('getCommandDangerLevel: git push without force → caution / git-push', () => {
  const result = getCommandDangerLevel('git push origin main');
  expect(result.level).toBe('caution');
  expect(result.reason).toBe('git-push');
});

test('getCommandDangerLevel: kill → caution / process-kill', () => {
  const result = getCommandDangerLevel('kill -9 9876');
  expect(result.level).toBe('caution');
  expect(result.reason).toBe('process-kill');
});

test('getCommandDangerLevel: chmod → caution / permission-change', () => {
  const result = getCommandDangerLevel('chmod 755 deploy.sh');
  expect(result.level).toBe('caution');
  expect(result.reason).toBe('permission-change');
});

test('getCommandDangerLevel: chown → caution / permission-change', () => {
  const result = getCommandDangerLevel('chown www-data:www-data /var/www/app');
  expect(result.level).toBe('caution');
  expect(result.reason).toBe('permission-change');
});

// ─── safe ─────────────────────────────────────────────

test('getCommandDangerLevel: ls → safe', () => {
  const result = getCommandDangerLevel('ls -la /tmp');
  expect(result.level).toBe('safe');
  expect(result.reason).toBe('');
});

test('getCommandDangerLevel: git status → safe', () => {
  const result = getCommandDangerLevel('git status');
  expect(result.level).toBe('safe');
  expect(result.reason).toBe('');
});

test('getCommandDangerLevel: npm install → safe', () => {
  const result = getCommandDangerLevel('npm install lodash');
  expect(result.level).toBe('safe');
  expect(result.reason).toBe('');
});

test('getCommandDangerLevel: echo → safe', () => {
  const result = getCommandDangerLevel('echo "deployment complete"');
  expect(result.level).toBe('safe');
  expect(result.reason).toBe('');
});

test('getCommandDangerLevel: empty string → safe', () => {
  const result = getCommandDangerLevel('');
  expect(result.level).toBe('safe');
  expect(result.reason).toBe('');
});
