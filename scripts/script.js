var endgAnimals = {};
var MAX_CHARS_FOR_SPECIES_DESC = 300;
var endangered;
var scientificName;
var category;
var extract;

endgAnimals.getAnimals = function(selectedCountry) {
	$.ajax({
		url: `http://apiv3.iucnredlist.org/api/v3/country/getspecies/${selectedCountry}`, 
		method: 'GET',
		dataType: 'JSON',
		data: {
			token: '9bb4facb6d23f48efbf424bb05c0c1ef1cf6f468393bc745d42179ac4aca5fee'
		}
	})
	.then(function(allTheAnimals) {
		var justAnimals = allTheAnimals.result;
		endangered = endgAnimals.filterAnimals(justAnimals);

    // var singleAnimal = endgAnimals.randomAnimal(endangered);
		// var category = singleAnimal.category;
		// var scientific_name = singleAnimal.scientific_name;
    // endgAnimals.getAnimalInfo(scientific_name);
    endgAnimals.getAnimalInfo();
	});
};

endgAnimals.randomAnimal = function(animals) {
	var item = Math.floor(Math.random()*animals.length);
	return animals[item];
};

endgAnimals.filterAnimals = function(animals) {
	animals = animals.filter(function(filteredAnimals) {
		return filteredAnimals.category === 'EN' || filteredAnimals.category === 'CR' || filteredAnimals.category === 'VU';
	});
	return animals;
};

endgAnimals.displayAnimals = function(speciesName, animalCategory) {
	var $animalContainer = $('<article>').addClass('');
	var $animalName = $('<h3>').text(speciesName);
	if (animalCategory === 'EN') {
		var animalCategory = 'Endangered';
	} else if (animalCategory === 'CR') {
		var animalCategory = 'Critically Endangered';
	} else {
		var animalCategory = 'Vulnerable';
	}
	var $animalCategory = $('<h4>').text('Status: ' + animalCategory);
	$animalContainer.append($animalName, $animalCategory);
	$('.animal-name').append($animalContainer);
};

endgAnimals.getAnimalInfo = function() {
  var singleAnimal = endgAnimals.randomAnimal(endangered);
  category = singleAnimal.category;
  scientificName = singleAnimal.scientific_name;
	return $.ajax({
		url: `https://en.wikipedia.org/w/api.php?format=json&action=query&prop=extracts&exintro=&explaintext=&titles=${scientificName}&redirects=1&origin=*&indexpageids=1`, 
		method: 'GET',
		dataType: 'JSON'
	})
	.then(function(animalDetails) {
		var pages = animalDetails.query.pages;
		var firstPage = Object.keys(pages)[0];
    // check if page has summary
    extract = pages[firstPage].extract;
    if (extract) {
      endgAnimals.getAnimalImages(scientificName);
      return;
    } else {
      // if not do it again.
      return endgAnimals.getAnimalInfo();
    }
		
	});
};

endgAnimals.shorten = function(animalText) {
  var newText = animalText;
	if (animalText && animalText.length > MAX_CHARS_FOR_SPECIES_DESC) {	
	    var newText = animalText.substr(0,MAX_CHARS_FOR_SPECIES_DESC-3) + '&hellip;'; 
	}
	return newText;
};

endgAnimals.getAnimalImages = function(scientificName) {
  endgAnimals.displayAnimals(scientificName, category);
  var animalText = endgAnimals.shorten(extract);
  var $animalText = $('<p>').html(animalText);
  var $readMore = `<a href="http://www.wikipedia.org/wiki/${scientificName}" target="_blank">(Click to read more...)</a>`;
  $('.animal-text').html($animalText);
  $('.read-more').html($readMore);
  $.ajax ({
    url: `https://en.wikipedia.org/w/api.php?action=query&prop=pageimages&format=json&piprop=original&redirects=1&origin=*&indexpageids=1&titles=${scientificName}`,
          method: 'GET',
          dataType: 'JSON'
  })
    .then(function(imageURL) {
      var pages = imageURL.query.pages;
      var firstPage = Object.keys(pages)[0];
      if(pages[firstPage].thumbnail) {
        var url = pages[firstPage].thumbnail.original;
      	endgAnimals.displayImage(url, scientificName);
      } else {
      // display ? image for when no image files were found
      endgAnimals.displayImage(false, scientificName);
      }
      $('.animal-profile').fadeIn();
      $('.loading').fadeOut();
  });
};

endgAnimals.displayImage = function(url, scientificName) {
    if (url) {
        var regex = /.svg|.pdf|.png/.test(url);
        if (regex === true) {
            var $animalimage = $('<img>').attr({
                src: 'images/question-mark.png',
                alt: 'No defined image for species.',
                title: 'No defined image for species.',
                class: 'question-mark'
            });
            $('.animal-name').append($animalimage);
        } else {
            var $animalimage = $('<img>').attr({
                src: url,
                alt: 'Photo of ' + scientificName,
                title: 'Photo of ' + scientificName,
                class: 'wiki-img'
            });
            $('.animal-name').append($animalimage);
        }
    } else {
        var $animalimage = $('<img>').attr({
            src: 'images/question-mark.png',
            title: 'No defined image for species.',
            alt: 'No defined image for species.',
            class: 'question-mark'
        });
        $('.animal-name').append($animalimage);
      }
};

endgAnimals.init = function() {
	$('.world-map').addClass('large');
	jQuery('#vmap').vectorMap({
	    map: 'world_en',
	    backgroundColor: 'transparent',
	    borderColor: 'transparent',
	    borderOpacity: 1,
	    borderWidth: 0.25,
	    color: 'rgba(255,255,255, 0.9)',
	    enableZoom: false,
	    hoverColor: '#DB504A',
	    hoverOpacity: null,
	    normalizeFunction: 'linear',
	    scaleColors: ['#b6d6ff', '#005ace'],
	    selectedColor: '#DB504A',
	    selectedRegions: null,
	    showTooltip: true,

	    //on click, grab the country code
	    onRegionClick: function(element, code, region) {
	        var selectedCountry = code.toUpperCase();
	        endgAnimals.getAnimals(selectedCountry);
	        $('.world-map').addClass('animate');
	log(speciesName);
	        $('.animal-text').empty();
	        $('.read-more').empty();
			$('.animal-name').empty();
			$('.animal-profile').fadeOut();
			$('.loading').fadeIn();
	    }
	});
};


$(function () {
	endgAnimals.init();
});
