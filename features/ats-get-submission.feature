Feature: Reading back a submission
  As the ATS
  I want to expose a submission's persisted state, profile, and stages
  So that callers can verify status transitions after a submission

  Background:
    Given the test data has been reset to the deterministic seed

  @positive
  Scenario: Fetching an existing submission returns its profile and stages
    Given I am authenticated as "u_recruiter_direct", a recruiter with direct access to "job_active"
    And I have submitted a candidate with a resume on file to role "job_active"
    When I fetch that submission by id
    Then the response status is 200
    And the response includes the candidate profile
    And the response includes at least one stage named "Application Review"

  @negative
  Scenario: Fetching a submission that does not exist returns not found
    Given no submission exists with id "does-not-exist"
    When I fetch submission "does-not-exist" by id
    Then the response status is 404
    And the response message is "Submission not found."
