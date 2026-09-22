Feature: Auto-approve cascade after submission
  As the ATS
  I want auto-approve recruiters' submissions to advance automatically
  So that eligible submissions reach the company without manual admin approval

  Background:
    Given the test data has been reset to the deterministic seed

  @positive
  Scenario: A submission is not advanced until the cascade is flushed
    Given I am authenticated as "u_recruiter_autoapprove", a recruiter with auto-approve enabled
    And I have a candidate with a resume on file
    When I submit the candidate to role "job_kombo"
    Then the response status is 200
    And the response's submission status is "PENDING_ADMIN_APPROVAL"

  @positive
  Scenario: An auto-approve submission to a Kombo-sourced role is pushed and approved after flush
    Given I am authenticated as "u_recruiter_autoapprove", a recruiter with auto-approve enabled
    And I have a candidate with a resume on file
    When I submit the candidate to role "job_kombo"
    And I flush the pending cascade
    Then the Kombo integration records a push for that candidate with no blocked reason
    And the Slack integration records a candidate intro for that submission's company
    And fetching that submission shows status "APPROVED"

  @negative
  Scenario: A submission from a non-auto-approve recruiter never advances past pending admin approval
    Given I am authenticated as "u_recruiter_direct", a recruiter without auto-approve enabled
    And I have a candidate with a resume on file
    When I submit the candidate to role "job_active"
    And I flush the pending cascade
    Then fetching that submission still shows status "PENDING_ADMIN_APPROVAL"
    And the Kombo integration records no push
