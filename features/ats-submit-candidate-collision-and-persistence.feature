Feature: Submission persistence and duplicate collision handling
  As the ATS
  I want to persist a submission exactly once per candidate/role pair
  So that recruiters cannot double-submit the same candidate to the same role

  Background:
    Given the test data has been reset to the deterministic seed
    And I am authenticated as "u_recruiter_direct", a recruiter with direct access to "job_active"

  @positive
  Scenario: A new candidate submission is persisted successfully
    Given I have a new candidate with a resume on file and a fresh email address
    When I submit the candidate to role "job_active"
    Then the response status is 200
    And the response includes a candidate profile, a submission, and a recruiter candidate id
    And the submission status is "PENDING_ADMIN_APPROVAL"

  @negative
  Scenario: Submitting the same candidate email to the same role twice is rejected
    Given I have already submitted candidate "ada@example.com" to role "job_active"
    When I submit a candidate with email "ada@example.com" to role "job_active" again
    Then the response status is 409
    And the response message is "This candidate has already been submitted to this role."

  @positive
  Scenario: Uploading a resume via a temp key moves it to public storage
    Given I have a new candidate with no resume on file
    And I provide a resume temp key for the upload
    When I submit the candidate to role "job_active"
    Then the response status is 200
    And the S3 integration records a resume move with the temp copy deleted
    And the candidate profile's resume points at the new public URL
