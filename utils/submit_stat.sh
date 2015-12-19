#!/bin/bash

curl -XPUT -d @test_stat_request.json https://stats-api.revsw.net/v1/stats/apps -v
