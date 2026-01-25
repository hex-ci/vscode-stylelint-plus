'use strict';

const { assert } = require('chai');
const { DiagnosticSeverity } = require('vscode-languageserver-types');
const stylelintWarningToVscodeDiagnostic = require('../../src/diagnostic');

describe('stylelintWarningToVscodeDiagnostic', () => {
  it('should convert an error warning to a Diagnostic', () => {
    const warning = {
      line: 10,
      column: 5,
      rule: 'color-no-invalid-hex',
      severity: 'error',
      text: 'Invalid hex color'
    };

    const diagnostic = stylelintWarningToVscodeDiagnostic(warning);

    assert.equal(diagnostic.range.start.line, 9);
    assert.equal(diagnostic.range.start.character, 4);
    assert.equal(diagnostic.range.end.line, 9);
    assert.equal(diagnostic.range.end.character, 4);
    assert.equal(diagnostic.message, 'Invalid hex color');
    assert.equal(diagnostic.severity, DiagnosticSeverity.Error);
    assert.equal(diagnostic.code, 'color-no-invalid-hex');
    assert.equal(diagnostic.source, 'stylelint');
  });

  it('should convert a warning warning to a Diagnostic', () => {
    const warning = {
      line: 1,
      column: 1,
      rule: 'indentation',
      severity: 'warning',
      text: 'Unexpected indentation'
    };

    const diagnostic = stylelintWarningToVscodeDiagnostic(warning);

    assert.equal(diagnostic.severity, DiagnosticSeverity.Warning);
  });

  it('should throw if warning is not an object', () => {
    assert.throws(() => stylelintWarningToVscodeDiagnostic(null), TypeError);
    assert.throws(() => stylelintWarningToVscodeDiagnostic('foo'), TypeError);
  });

  it('should throw if line/column are missing', () => {
    const warning = {
      column: 1,
      rule: 'foo',
      severity: 'error',
      text: 'bar'
    };
    assert.throws(() => stylelintWarningToVscodeDiagnostic(warning), TypeError);
  });

  it('should throw if severity is invalid', () => {
    const warning = {
      line: 1,
      column: 1,
      rule: 'foo',
      severity: 'info',
      text: 'bar'
    };
    assert.throws(() => stylelintWarningToVscodeDiagnostic(warning), Error);
  });
});
