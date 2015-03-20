
var networkApp = angular.module('networkApp', []);

networkApp.directive('forceLayout', function ($parse) {
  return {
     restrict: 'E',
     replace: false,
     // Private scope, use if you expect multiple force-layouts inside the same controller!
     // For this add chart-data="graph" attribute to force-layout and watch changes for 'data' instead for 'graph' 
     // scope: {
     //    data: '=chartData'
     // },
     link: function (scope, element, attrs) {

        var width = attrs.width || 600,
            height = attrs.height || 500;

        var color = d3.scale.category20();

        var force = d3.layout.force()
            .charge(-120)
            .linkDistance(30)
            .size([width, height]);

        var link;

        var svg = d3.select(element[0]).append("svg")
            .attr("width", width)
            .attr("height", height);

      // If url attribute is defined load network directly from there
      if (attrs.initialUrl) {
        scope.getData({url: attrs.initialUrl, method: 'GET'});
      }

      // scope.$watch('data', function (newData, oldData) {
      scope.$watch('graph', function (newData, oldData) {

        // remove all previous items before render
        svg.selectAll('*').remove();

        if (!newData) { return; }

        var graph = newData;

        // TODO: Replace this with a D3 scale?
        var populationToRadius = function(p) {
          return 0.002*Math.sqrt(p);
        }

        var population = graph.nodes.map(function(x){return x.population;});

        // TODO: Note that the graph variable is shared, and that D3 force layout starts
        //       changing it (adding position properties) when it starts building layout.
        //       This is why we made a deep copy in the controller so that we have original 
        //       for other purposes (like text output).

        var initialLinks = [];
        if (attrs.showAll) { initialLinks = graph.links; }

        force
            .nodes(graph.nodes)
            .links(initialLinks) 
            .linkStrength(0.2)
            .charge(-100)
            .linkDistance(300)
            .start();

        link = svg.selectAll(".link")
            .data(initialLinks).enter().append("line")
            .attr("class", "link")
            .style("stroke-width", function(d) { return 0.01*Math.sqrt(d.weight); });

        var node = svg.selectAll(".node")
            .data(graph.nodes)
            .enter().append("g")
            .attr("class", "node")
            .call(force.drag);

        node.append("circle")
            .attr("r", function(d){ return populationToRadius(d.population); });

        node.append("text")
            .attr("dx", function(d){ return populationToRadius(d.population) + 5; })
            .attr("dy", ".35em")
            .text(function(d) { return d.label });

        force.on("tick", function() {
          link.attr("x1", function(d) { return d.source.x; })
              .attr("y1", function(d) { return d.source.y; })
              .attr("x2", function(d) { return d.target.x; })
              .attr("y2", function(d) { return d.target.y; });

          d3.selectAll("circle")
            .attr("cx", function (d) { return d.x; })
            .attr("cy", function (d) { return d.y; });

          d3.selectAll("text")
            .attr("x", function (d) { return d.x; })
            .attr("y", function (d) { return d.y; });
        });

      });

      scope.$watch('selectedLinks', function (newData, oldData) {
        
        if (!newData) { return; }

        var selectedLinks = newData;

        link = link.data(selectedLinks);
        link.exit().remove();
        link.enter().insert("line",":first-child")
          .attr("class", "link")
          .style("stroke-width", function(d) { return 0.01*Math.sqrt(d.weight); });

        force.links(selectedLinks)
        force.start();

      });

  }};

});
 

networkApp.directive('aspectSelector', function () {
  return {
     restrict: 'E',
     link: function (scope, element, attrs) {

        scope.$watch('graph', function (newData, oldData) {
          if (!newData) { return; }

          var graph = newData;

           // First remove all aspect selectors
          var previousAspectSelectors = d3.select(element[0]).selectAll('select');
          if (previousAspectSelectors[0].length > 0) {
              previousAspectSelectors[0].forEach(function(aspect){
                  $(aspect).multiselect('destroy');
                  aspect.remove();
              });
          }

          // Get names of all aspects in graph (everything that is not nodes and links)
          var aspectNames = Object.keys(graph).filter(function(x){return x!="links" & x!="nodes"});

          // Append one aspect selector for each aspect in graph
          var aspectSelectors = d3.select(element[0]).selectAll('select')
                                  .data(aspectNames).enter()
                                  .append('select')
                                  .attr('id',function(d){return 'layers-multiselect-'+d;})
                                  .attr('multiple','multiple');

          // Attach multiselect behaviour to each aspect selector and fill corresponding options
          aspectSelectors[0].forEach(function(aspect){
              $(aspect).multiselect('setOptions',{
                  numberDisplayed: 0,
                  includeSelectAllOption: true,
                  enableFiltering: true,
                  enableCaseInsensitiveFiltering: true,
                  onChange: function(option, checked, select) {
                              var selectedLayers = {};
                              $(element[0]).children('select').children('option:selected').each(
                                function(i,e){
                                  var a = e.parentElement.__data__;
                                  selectedLayers[a] = selectedLayers[a] || [];
                                  selectedLayers[a].push(e.value);  
                                });

                              filterLinks(selectedLayers);
                            }
              });
              var options = graph[aspect.__data__].map(function(x){return {'label': x.label, 'value': x.id};});
              $(aspect).multiselect('dataprovider', options);
          });

          var filterLinks = function(layers) {

              // TODO: Assumption is that only links change throughout the layers, not nodes!

              // Filter links satisfying any of the layers within certain aspect for all aspect
              var selectedLinks;
              if (Object.keys(layers).length == 0) {
                selectedLinks = []; 
              }
              else {
                selectedLinks = graph.links.filter(
                  function(link){
                    select = [];
                    for (key in layers) {
                        if (layers.hasOwnProperty(key)) {
                          // Select links that belong to any selected layer in each aspect
                          select.push( layers[key].map(function(id){return link[key]==id;})
                                                  .reduce(function(p,c){return p||c;},0) );
                        }
                    }
                    // Select links that are selected in all aspects
                    return select.reduce(function(p,c){return p&&c;},1);
                });
              }

              scope.setSelectedLinks(selectedLinks);

            }

      });

  }};

});


// Loading data
networkApp.controller('networkCtrl', function ($scope, $http) {

    $scope.setSelectedLinks = function(links) {
      $scope.selectedLinks = links;
      $scope.$apply();
    }

    // TODO: The exact location of the data has to be specified in the element.
    //       Maybe to abstract it somehow?
    $scope.getData = function (url) {
      $http(url).
      success(function (data) {
        // attach this data to the scope
        $scope.graph = data;

        // Make a deep copy of the graph so that you can use it for text output 
        // before force layout starts adding positioning properties.
        $scope.originalGraph = $.extend(true, {}, data);

        console.log($scope.graph);

        // clear the error messages
        $scope.error = '';
      }).
      error(function (data, status) {
        if (status === 404) {
          $scope.error = 'REST server is offline!';
        } else {
          $scope.error = 'Error: ' + status;
        }
      });
    };

    $scope.filesChanged = function(element) {
      var reader = new FileReader();
      reader.onload = function(e) {
        $scope.graph = JSON.parse(reader.result);
        $scope.$apply(); // apply should come here, not outside onload function!
      }
      reader.readAsText(element.files[0]);  
    };

    $scope.getInfoData = function(url) {
      $http.get(url)
           .success(function (data) {
                $scope.infodata = data;
                $scope.error = '';
           })
          .error(function (data, status) {
              if (status === 404) {
                $scope.error = 'REST server is offline!';
              } else {
                $scope.error = 'Error: ' + status;
              }
          });
    };

});


networkApp.directive('restLoad',function(){
  return {
    restrict: 'E',
    link: function(scope,element,attrs){

        // Immediately load info data from the server. 
        scope.getInfoData(attrs.infoUrl);

        scope.$watch('infodata', function (newData, oldData) {
          if (!newData) { return; }

          // Append a button for loading from REST server
          $(element).append($('<button>',
            {'type': 'button', 
             'class':'btn btn-default', 
             text: 'Load from REST',
             click: function(x){
                var selectedLayers = {};
                $('rest-load option:selected').each(
                  function(i,e){
                    var a = e.parentElement.__data__;
                    selectedLayers[a] = selectedLayers[a] || [];
                    selectedLayers[a].push(e.value);  
                  });
                console.log('Number of links: ' + $('#number-of-links').val());
                var options = {url: attrs.url,
                               method: 'GET', 
                               params: {
                                numberOfLinks: $('#number-of-links').val(),
                                products: JSON.stringify(selectedLayers.product),
                                countries: JSON.stringify(selectedLayers.countries),
                                years: JSON.stringify(selectedLayers.year)
                               }
                              };
                scope.getData(options);
             }
           }));

          // Append one aspect selector for each aspect in graph
          var aspectSelectors = d3.select(element[0]).selectAll('select')
                                  .data(Object.keys(newData)).enter()
                                  .append('select')
                                  .attr('id',function(d){return 'layers-multiselect-'+d;})
                                  .attr('multiple','multiple');

          // Attach multiselect behaviour to each aspect selector and fill corresponding options
          aspectSelectors[0].forEach(function(aspect){
              $(aspect).multiselect('setOptions',{
                  maxHeight: 20, // NOT WORKING!
                  numberDisplayed: 0,
                  includeSelectAllOption: true,
                  enableFiltering: true,
                  enableCaseInsensitiveFiltering: true
              });
              var options = newData[aspect.__data__].map(function(x){return {'label': x.label, 'value': x.id};});
              $(aspect).multiselect('dataprovider', options);
          });

          // Insput for the number of links
          $(element).append(
            $('<div>',{'class':'input-group'}).append(
              $('<input>',
                {'type':'text',
                 'class':'form-control',
                 'placeholder':'max number of links',
                 'maxlength':6,
                 'id':'number-of-links'
                }))
          );

        });
    
    }
  }
});


// TODO: Maybe add Bootstrap dropdown menu for this!
networkApp.directive('serverLoad',function(){
  return {
    restrict: 'E',
    link: function(scope,element,attrs){

        $(element).append($('<button>',
          {'type': 'button', 
           'class':'btn btn-default', 
           text: 'Load from ' + attrs.url.substring(0,10) + '...',
           click: function(x){
              var options = {url: attrs.url, method: 'GET'};
              scope.getData(options);
           }
         }));

    }
  }
});


networkApp.directive('fileLoad',function(){
  return {
    restrict: 'E',
    link: function(scope,element,attrs){

      $(element)
        .append($('<span>',
          {'class':'btn btn-default btn-file', 
            text: 'Load from disk'
          }).append($('<input>',
            { 'type': 'file',
              'onchange': "angular.element(this).scope().filesChanged(this)"
            })
        )
      );
    
    }
  }
});


networkApp.directive('networkDump', function () {
  return {
     restrict: 'E',
     link: function (scope, element, attrs) {

        scope.$watch('originalGraph', function (newData, oldData) {
          if (!newData) { return; }

          var graph = newData;

          $(element).empty();

          $(element).append($('<pre>',
            {'class':'networkDump',
              text: function(){return JSON.stringify(graph, null, 4);}
            }));

         });

  }};

});