Feature: Test-support seam (reset and recorders)
  As a QA engineer
  I want deterministic reset and visibility into stubbed side effects
  So that I can set up known state and assert on integration calls

  @positive
  Scenario: Resetting test data returns deterministic seed counts
    Given the test data may be in any state
    When I reset the test data
    Then the response status is 201
    And the response reports 7 users, 2 companies, 5 jobs, 2 recruiter candidates, and 0 submissions

  @positive
  Scenario: Recorders are empty immediately after a reset
    Given the test data has been reset to the deterministic seed
    When I fetch the recorders
    Then the response status is 200
    And the recorders list is empty

  @positive
  Scenario: Recorders capture side effects from a submission attempt
    Given the test data has been reset to the deterministic seed
    And I have submitted a candidate as a non-recruiter and been rejected
    When I fetch the recorders
    Then the recorders include an analytics event named "api_candidate_submission_failed"

  @positive
  Scenario: Recorders only reflect flushed cascade side effects when explicitly requested
    Given the test data has been reset to the deterministic seed
    And I have submitted an auto-approve candidate to a Kombo-sourced role
    When I fetch the recorders without flushing
    Then the recorders include no Kombo push
    When I fetch the recorders with the cascade flushed
    Then the recorders include a Kombo push for that submission
