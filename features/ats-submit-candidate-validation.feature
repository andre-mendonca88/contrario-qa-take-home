Feature: Candidate and screening-answer validation on submission
  As the ATS
  I want to validate screening answers and enforce the resume guard
  So that only complete, well-formed submissions are persisted

  Background:
    Given the test data has been reset to the deterministic seed
    And I am authenticated as "u_recruiter_direct", a recruiter with direct access to "job_active"

  @negative
  Scenario: A screening answer over the maximum length is rejected
    Given I have a candidate with a resume on file
    And one of my screening answers is 5001 characters long
    When I submit the candidate to role "job_active"
    Then the response status is 400
    And the response message is "A screening answer exceeds the maximum allowed length."

  @negative
  Scenario: A new candidate with no resume anywhere is rejected
    Given I have a brand new candidate with no resume on file
    And I do not provide a resume temp key
    When I submit the candidate to role "job_active"
    Then the response status is 400
    And the response message is "A resume must be uploaded before submitting."

  @positive
  Scenario: A known candidate with a resume already on file can be submitted without an upload
    Given I reuse existing recruiter candidate "rc_with_resume", who already has a resume on file
    And I do not provide a resume temp key
    When I submit the candidate to role "job_active"
    Then the response status is 200
    And no resume move is recorded by the S3 integration

  @positive
  Scenario: INFORMATION-type screening answers are dropped before persistence
    Given I have a candidate with a resume on file
    And my screening answers include one "QUESTION" answer and one "INFORMATION" answer
    When I submit the candidate to role "job_active"
    Then the response status is 200
    And the persisted submission's filtered answers include only the "QUESTION" answer
